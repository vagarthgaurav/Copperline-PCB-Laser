//! Laser G-code for isolation routing behind the `generate_gcode` Tauri
//! command. The parsed project stays in Rust (see `ProjectStore`); the UI only
//! sends the board placement and the laser parameters.
//!
//! Pipeline: copper primitives -> union -> outward offsets (`isolation`) ->
//! board-to-machine transform (`placement`) -> simplified, ordered toolpath
//! (`toolpath`) -> text (`emit`).

mod emit;
mod isolation;
mod placement;
#[cfg(test)]
mod tests;
mod toolpath;

use crate::gerber::ProjectStore;
use crate::gerber::model::{Bounds, LayerKind, ParsedProject};
use serde::{Deserialize, Serialize};
use tauri::State;

pub use placement::Placement;

/// Largest accepted number of isolation passes.
const MAX_PASSES: u32 = 20;
/// Largest accepted overlap between adjacent passes.
const MAX_OVERLAP: f64 = 0.9;
/// Rapid speed assumed for the time estimate when the request has none.
const DEFAULT_RAPID_RATE: f64 = 3000.0;

/// The G-code flavour. Dialect-specific text lives in methods on this type
/// (see `emit.rs`); everything else is shared, so a new variant is one match
/// arm per method.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Dialect {
  #[default]
  GrblHal,
}

/// Which copper layer to expose.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BoardSide {
  Top,
  Bottom,
}

impl BoardSide {
  fn layer_kind(self) -> LayerKind {
    match self {
      BoardSide::Top => LayerKind::TopCopper,
      BoardSide::Bottom => LayerKind::BottomCopper,
    }
  }

  fn name(self) -> &'static str {
    match self {
      BoardSide::Top => "top",
      BoardSide::Bottom => "bottom",
    }
  }
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GcodeRequest {
  #[serde(default)]
  pub dialect: Dialect,
  pub side: BoardSide,
  pub placement: Placement,
  /// Laser power, 0..=100 %.
  pub power_percent: f64,
  /// Engraving feed in mm/min.
  pub feed_rate: f64,
  /// Rapid speed in mm/min. Only used for the time estimate: GRBL ignores F on G0.
  #[serde(default)]
  pub rapid_rate: Option<f64>,
  /// Laser spot / line width in mm.
  #[serde(default = "default_spot")]
  pub spot_diameter: f64,
  /// Number of isolation passes, 1..=20.
  #[serde(default = "default_passes")]
  pub isolation_passes: u32,
  /// Fraction of the spot width adjacent passes overlap, 0..=0.9.
  #[serde(default = "default_overlap")]
  pub pass_overlap: f64,
  /// The S value for 100 % power (grblHAL `$30`).
  #[serde(default = "default_spindle_max")]
  pub spindle_max: f64,
}

fn default_spot() -> f64 {
  0.1
}

fn default_passes() -> u32 {
  1
}

fn default_overlap() -> f64 {
  0.3
}

fn default_spindle_max() -> f64 {
  1000.0
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GcodeStats {
  pub contour_count: usize,
  pub engrave_length_mm: f64,
  pub rapid_length_mm: f64,
  pub estimated_seconds: f64,
  /// Extent of the toolpath in machine coordinates.
  pub bounds: Bounds,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GcodeOutput {
  pub lines: Vec<String>,
  pub stats: GcodeStats,
  pub warnings: Vec<String>,
}

/// Generates isolation G-code for the project last parsed.
#[tauri::command]
pub async fn generate_gcode(
  request: GcodeRequest,
  store: State<'_, ProjectStore>,
) -> Result<GcodeOutput, String> {
  validate(&request)?;
  let project = store
    .snapshot_layers(request.side.layer_kind())
    .ok_or_else(|| "No project is loaded".to_string())?;
  tauri::async_runtime::spawn_blocking(move || generate(&project, &request))
    .await
    .map_err(|e| e.to_string())?
}

/// Pure version of the command: no Tauri needed.
pub fn generate(project: &ParsedProject, request: &GcodeRequest) -> Result<GcodeOutput, String> {
  validate(request)?;
  let kind = request.side.layer_kind();
  let primitives: Vec<_> = project
    .layers
    .iter()
    .filter(|l| l.kind == kind)
    .flat_map(|l| l.primitives.iter())
    .collect();
  if primitives.is_empty() {
    return Err(format!(
      "No {} copper layer in this project",
      request.side.name()
    ));
  }
  let board = project
    .board
    .as_ref()
    .ok_or("The project has no board bounds")?;
  if emit::spindle_value(request) == 0 {
    return Err("The laser power rounds to S0, nothing would be exposed".into());
  }

  let mut warnings = Vec::new();
  let passes = isolation::isolation_passes(
    primitives,
    request.spot_diameter,
    request.isolation_passes,
    request.pass_overlap,
  );
  let mut contours = Vec::new();
  for (index, pass) in passes.into_iter().enumerate() {
    if pass.is_empty() {
      warnings.push(format!("Isolation pass {} produced no toolpath", index + 1));
    }
    contours.extend(pass);
  }

  let mirrored = request.side == BoardSide::Bottom;
  let transform = placement::board_transform(&board.bounds, &request.placement, mirrored);
  for contour in &mut contours {
    for point in contour.iter_mut() {
      *point = transform.apply(*point);
    }
  }
  let contours = toolpath::order(toolpath::simplify(contours));
  if contours.is_empty() {
    return Err("Nothing to engrave".into());
  }

  let rapid_rate = request.rapid_rate.unwrap_or(DEFAULT_RAPID_RATE);
  let stats = toolpath::stats(&contours, request.feed_rate, rapid_rate);
  if stats.bounds.min_x < 0.0 || stats.bounds.min_y < 0.0 {
    warnings.push("The toolpath extends below 0 on X or Y".into());
  }
  let lines = emit::emit(&contours, request, &project.name);
  Ok(GcodeOutput {
    lines,
    stats,
    warnings,
  })
}

fn validate(request: &GcodeRequest) -> Result<(), String> {
  let finite = [
    ("offset X", request.placement.offset_x),
    ("offset Y", request.placement.offset_y),
    ("power", request.power_percent),
    ("feed rate", request.feed_rate),
    ("spot diameter", request.spot_diameter),
    ("pass overlap", request.pass_overlap),
    ("spindle maximum", request.spindle_max),
  ];
  for (name, value) in finite {
    if !value.is_finite() {
      return Err(format!("The {name} must be a finite number"));
    }
  }
  if let Some(rate) = request.rapid_rate
    && !(rate.is_finite() && rate > 0.0)
  {
    return Err("The rapid rate must be greater than 0".into());
  }
  if !(0.0..=100.0).contains(&request.power_percent) {
    return Err("The power must be between 0 and 100 %".into());
  }
  if request.power_percent == 0.0 {
    return Err("The power is 0 %, nothing would be exposed".into());
  }
  if request.feed_rate <= 0.0 {
    return Err("The feed rate must be greater than 0".into());
  }
  if request.spot_diameter <= 0.0 {
    return Err("The spot diameter must be greater than 0".into());
  }
  if !(0.0..=MAX_OVERLAP).contains(&request.pass_overlap) {
    return Err("The pass overlap must be between 0 and 0.9".into());
  }
  if request.spindle_max <= 0.0 {
    return Err("The spindle maximum must be greater than 0".into());
  }
  if !(1..=MAX_PASSES).contains(&request.isolation_passes) {
    return Err(format!(
      "The number of passes must be between 1 and {MAX_PASSES}"
    ));
  }
  Ok(())
}
