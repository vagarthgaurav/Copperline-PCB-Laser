//! Serde types shared with the Angular side. See the Rust/Angular contract:
//! all geometry is in millimetres, +Y up, as authored in the source files.

use serde::{Deserialize, Serialize};

pub type Point = [f64; 2];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InputFile {
  pub name: String,
  pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedProject {
  pub name: String,
  pub layers: Vec<ParsedLayer>,
  pub skipped: Vec<SkippedFile>,
  pub board: Option<BoardInfo>,
  /// The physical blank (centre lines of the blank-edge layer), if the project has a valid one.
  pub blank: Option<Bounds>,
  /// Every hole of the non-plated drill file: the pegs the board is pinned on.
  pub peg_holes: Vec<PegHole>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PegHole {
  pub x: f64,
  pub y: f64,
  pub diameter: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardInfo {
  pub bounds: Bounds,
  pub source: BoardSource,
  pub width: f64,
  pub height: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BoardSource {
  Outline,
  Copper,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bounds {
  pub min_x: f64,
  pub min_y: f64,
  pub max_x: f64,
  pub max_y: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LayerKind {
  TopCopper,
  BottomCopper,
  Outline,
  Drill,
}

impl LayerKind {
  pub fn label(self) -> &'static str {
    match self {
      LayerKind::TopCopper => "Top copper",
      LayerKind::BottomCopper => "Bottom copper",
      LayerKind::Outline => "Outline",
      LayerKind::Drill => "Drill",
    }
  }

  /// Sort position: topCopper, bottomCopper, outline, drill.
  pub fn order(self) -> u8 {
    match self {
      LayerKind::TopCopper => 0,
      LayerKind::BottomCopper => 1,
      LayerKind::Outline => 2,
      LayerKind::Drill => 3,
    }
  }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedLayer {
  pub id: String,
  pub file_name: String,
  pub kind: LayerKind,
  pub label: String,
  pub bounds: Bounds,
  pub primitive_count: usize,
  pub warnings: Vec<String>,
  pub primitives: Vec<Primitive>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedFile {
  pub file_name: String,
  pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
  tag = "type",
  rename_all = "camelCase",
  rename_all_fields = "camelCase"
)]
pub enum Primitive {
  Draw { from: Point, to: Point, width: f64 },
  Flash { at: Point, shape: FlashShape },
  Region { points: Vec<Point> },
  Hole { at: Point, diameter: f64 },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
  tag = "kind",
  rename_all = "camelCase",
  rename_all_fields = "camelCase"
)]
pub enum FlashShape {
  Circle {
    diameter: f64,
  },
  Rect {
    width: f64,
    height: f64,
    rotation: f64,
  },
  Obround {
    width: f64,
    height: f64,
    rotation: f64,
  },
  Polygon {
    points: Vec<Point>,
  },
}

/// What a single-file parser returns before the layer is assembled.
#[derive(Debug, Default)]
pub struct Geometry {
  pub primitives: Vec<Primitive>,
  pub warnings: Vec<String>,
}

/// Upper bound on primitives per layer; guards against absurd input.
pub const MAX_PRIMITIVES: usize = 2_000_000;
/// Upper bound on any coordinate or size in mm (100 m).
pub const MAX_COORD_MM: f64 = 100_000.0;
