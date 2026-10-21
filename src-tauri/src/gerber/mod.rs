//! Gerber (RS-274X) and Excellon parsing behind the `parse_gerber_files`
//! Tauri command. See the Rust/Angular contract for the output shape.

pub mod archive;
mod classify;
mod excellon;
mod expr;
pub(crate) mod geometry;
mod macros;
pub(crate) mod model;
mod project;
mod rs274x;
mod store;

pub use model::{InputFile, ParsedProject};
pub use store::ProjectStore;

use classify::{Classification, Format, classify};
use geometry::primitives_bounds;
use model::{Geometry, LayerKind, ParsedLayer, SkippedFile};
use std::panic::{AssertUnwindSafe, catch_unwind};

#[tauri::command]
pub async fn parse_gerber_files(
  files: Vec<InputFile>,
  store: tauri::State<'_, ProjectStore>,
) -> Result<ParsedProject, String> {
  let project = tauri::async_runtime::spawn_blocking(move || parse_project(&files))
    .await
    .map_err(|e| e.to_string())?;
  // Rust keeps the parsed project so G-code generation needs no geometry from the UI.
  store.set(project.clone());
  Ok(project)
}

/// Parses a set of files into layers. Never fails: unusable files are
/// reported in `skipped`.
pub fn parse_project(files: &[InputFile]) -> ParsedProject {
  let mut layers = Vec::new();
  let mut skipped = Vec::new();
  for file in files {
    let skip = |reason: String| SkippedFile {
      file_name: file.name.clone(),
      reason,
    };
    match classify(&file.name, &file.content) {
      Classification::Skip(reason) => skipped.push(skip(reason)),
      Classification::Layer(kind, format) => match parse_file(format, &file.content) {
        Err(detail) => skipped.push(skip(format!("Could not parse: {detail}"))),
        Ok(geometry) if geometry.primitives.is_empty() => {
          // An empty drill file (e.g. no NPTH holes) is simply left out.
          if kind != LayerKind::Drill {
            skipped.push(skip("The file contains no drawable geometry".into()));
          }
        }
        Ok(geometry) => layers.push(build_layer(&file.name, kind, geometry)),
      },
    }
  }
  project::sort_layers(&mut layers);
  ParsedProject {
    name: project::derive_name(files),
    board: project::board_info(&layers),
    layers,
    skipped,
  }
}

fn parse_file(format: Format, content: &str) -> Result<Geometry, String> {
  let parse = || match format {
    Format::Gerber => rs274x::parse(content),
    Format::Excellon => excellon::parse(content),
  };
  catch_unwind(AssertUnwindSafe(parse)).unwrap_or_else(|_| Err("internal error".into()))
}

fn build_layer(name: &str, kind: LayerKind, geometry: Geometry) -> ParsedLayer {
  let bounds = primitives_bounds(&geometry.primitives, true).expect("layer has primitives");
  ParsedLayer {
    id: name.to_string(),
    file_name: name.to_string(),
    kind,
    label: kind.label().to_string(),
    bounds,
    primitive_count: geometry.primitives.len(),
    warnings: geometry.warnings,
    primitives: geometry.primitives,
  }
}

#[cfg(test)]
mod tests;
