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

use classify::{Classification, Format, classify, is_blank_edge_name, is_excellon, is_non_plated};
use geometry::{primitives_bounds, round6};
use model::{
  BoardInfo, BoardSource, Bounds, Geometry, LayerKind, ParsedLayer, PegHole, Primitive, SkippedFile,
};
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
  let mut peg_holes = Vec::new();
  let mut blank_files = Vec::new();
  for file in files {
    let skip = |reason: String| SkippedFile {
      file_name: file.name.clone(),
      reason,
    };
    // The blank edge is not a layer; it is resolved once the outline is known.
    if is_blank_edge_name(&file.name) && !is_excellon(&file.content) {
      blank_files.push(file);
      continue;
    }
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
        Ok(geometry) => {
          if kind == LayerKind::Drill && is_non_plated(&file.name, &file.content) {
            peg_holes.extend(geometry.primitives.iter().filter_map(peg_hole));
          }
          layers.push(build_layer(&file.name, kind, geometry));
        }
      },
    }
  }
  project::sort_layers(&mut layers);
  let board = project::board_info(&layers);
  let blank = resolve_blank(&blank_files, board.as_ref(), &mut skipped);
  ParsedProject {
    name: project::derive_name(files),
    board,
    blank,
    peg_holes,
    layers,
    skipped,
  }
}

fn peg_hole(primitive: &Primitive) -> Option<PegHole> {
  match primitive {
    Primitive::Hole { at, diameter } => Some(PegHole {
      x: round6(at[0]),
      y: round6(at[1]),
      diameter: round6(*diameter),
    }),
    _ => None,
  }
}

/// Slack when checking that the blank encloses the outline, in mm.
const BLANK_TOLERANCE_MM: f64 = 0.01;

/// The blank rectangle from the first blank-edge file that is usable; the
/// others, and unusable ones, go to `skipped` with a reason.
fn resolve_blank(
  candidates: &[&InputFile],
  board: Option<&BoardInfo>,
  skipped: &mut Vec<SkippedFile>,
) -> Option<Bounds> {
  let outline = board
    .filter(|b| b.source == BoardSource::Outline)
    .map(|b| b.bounds);
  let mut blank = None;
  for file in candidates {
    let result = if blank.is_some() {
      Err("Another blank edge file is already used".to_string())
    } else {
      blank_bounds(file, outline.as_ref())
    };
    match result {
      Ok(bounds) => blank = Some(bounds),
      Err(reason) => skipped.push(SkippedFile {
        file_name: file.name.clone(),
        reason,
      }),
    }
  }
  blank
}

fn blank_bounds(file: &InputFile, outline: Option<&Bounds>) -> Result<Bounds, String> {
  let geometry = parse_file(Format::Gerber, &file.content)
    .map_err(|detail| format!("Could not parse: {detail}"))?;
  // The drawn edge is the blank edge: measure its centre line.
  let bounds = primitives_bounds(&geometry.primitives, false)
    .filter(|b| b.max_x > b.min_x && b.max_y > b.min_y)
    .ok_or("Blank edge does not draw a rectangle")?;
  if let Some(o) = outline {
    let t = BLANK_TOLERANCE_MM;
    let encloses = bounds.min_x <= o.min_x + t
      && bounds.min_y <= o.min_y + t
      && bounds.max_x >= o.max_x - t
      && bounds.max_y >= o.max_y - t;
    if !encloses {
      return Err("Blank edge does not enclose the board outline".into());
    }
  }
  Ok(bounds)
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
