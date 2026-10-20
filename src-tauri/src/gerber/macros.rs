//! Aperture macros (`%AM`): evaluated into polygon flash shapes.
//! Supported primitives: 1 circle, 4 outline, 5 polygon, 20 vector line,
//! 21 centre line, 22 lower-left line. Others yield a warning.

use super::expr::{self, Vars};
use super::geometry::{circle_polygon, regular_polygon, rotate_point};
use super::model::{FlashShape, Point};

const MAX_OUTLINE_POINTS: usize = 10_000;
const MAX_POLYGON_VERTICES: usize = 1_000;

/// Raw macro body: one statement per entry, comments already removed.
#[derive(Debug, Clone, Default)]
pub struct MacroDef {
  pub statements: Vec<String>,
}

impl MacroDef {
  /// Builds a definition from the blocks following `AMname`.
  pub fn from_blocks<'a>(blocks: impl Iterator<Item = &'a str>) -> Self {
    let statements = blocks
      .map(str::trim)
      .filter(|b| !b.is_empty())
      .filter(|b| *b != "0" && !b.starts_with("0 "))
      .map(|b| b.chars().filter(|c| !c.is_whitespace()).collect())
      .collect();
    MacroDef { statements }
  }
}

/// Evaluates a macro with the given positional parameters. `scale` converts
/// file units to mm. Polygons are relative to the aperture origin.
pub fn evaluate(
  def: &MacroDef,
  params: &[f64],
  scale: f64,
  warnings: &mut Vec<String>,
) -> Result<Vec<FlashShape>, String> {
  let mut vars: Vars = params
    .iter()
    .enumerate()
    .map(|(i, v)| (i + 1, *v))
    .collect();
  let mut shapes = Vec::new();
  let mut warn = |msg: String| {
    if !warnings.contains(&msg) {
      warnings.push(msg);
    }
  };
  for stmt in &def.statements {
    if let Some(rest) = stmt.strip_prefix('$') {
      let (var, expression) = rest
        .split_once('=')
        .ok_or("malformed macro variable assignment")?;
      let index: usize = var
        .parse()
        .map_err(|_| "malformed macro variable".to_string())?;
      let value = expr::eval(expression, &vars)?;
      vars.insert(index, value);
      continue;
    }
    let fields: Vec<&str> = stmt.split(',').collect();
    let code: u32 = fields[0]
      .parse()
      .map_err(|_| format!("invalid macro primitive '{}'", fields[0]))?;
    let args = fields[1..]
      .iter()
      .map(|f| expr::eval(f, &vars))
      .collect::<Result<Vec<f64>, _>>()?;
    match primitive(code, &args, scale) {
      Prim::Shape(Some(points)) => shapes.push(FlashShape::Polygon { points }),
      Prim::Shape(None) => {}
      Prim::Clear => warn("Aperture macro uses clear exposure, which is ignored".into()),
      Prim::Unsupported => warn(format!(
        "Aperture macro primitive {code} is not supported and was skipped"
      )),
      Prim::Malformed => return Err(format!("macro primitive {code} has too few parameters")),
    }
  }
  Ok(shapes)
}

enum Prim {
  Shape(Option<Vec<Point>>),
  Clear,
  Unsupported,
  Malformed,
}

fn primitive(code: u32, a: &[f64], scale: f64) -> Prim {
  let need = |n: usize| a.len() >= n;
  let rot = |idx: usize| a.get(idx).copied().unwrap_or(0.0);
  let finish = |pts: Vec<Point>, rotation: f64| -> Prim {
    let pts = pts
      .into_iter()
      .map(|p| {
        let q = rotate_point(p, rotation);
        [q[0] * scale, q[1] * scale]
      })
      .collect();
    Prim::Shape(Some(pts))
  };
  // Exposure (a[0]) is 1 for dark, 0 for clear.
  let clear = |a: &[f64]| a.first().is_some_and(|e| *e == 0.0);
  match code {
    1 => {
      if !need(4) {
        return Prim::Malformed;
      }
      if clear(a) {
        return Prim::Clear;
      }
      // Build in mm so the segment count reflects the real radius.
      let r = (a[1] / 2.0).abs() * scale;
      let c = rotate_point([a[2], a[3]], rot(4));
      let pts = circle_polygon([c[0] * scale, c[1] * scale], r);
      Prim::Shape(Some(pts))
    }
    4 => {
      if !need(2) {
        return Prim::Malformed;
      }
      let n = a[1].max(0.0) as usize + 1;
      if n > MAX_OUTLINE_POINTS {
        return Prim::Unsupported;
      }
      if !need(2 + 2 * n) {
        return Prim::Malformed;
      }
      if clear(a) {
        return Prim::Clear;
      }
      let mut pts: Vec<Point> = (0..n).map(|k| [a[2 + 2 * k], a[3 + 2 * k]]).collect();
      if pts.len() > 3 && pts.first() == pts.last() {
        pts.pop();
      }
      finish(pts, rot(2 + 2 * n))
    }
    5 => {
      if !need(5) {
        return Prim::Malformed;
      }
      if clear(a) {
        return Prim::Clear;
      }
      let vertices = (a[1].max(3.0) as usize).min(MAX_POLYGON_VERTICES);
      // Vertices are generated unrotated about the centre, then the whole
      // shape is rotated about the aperture origin.
      let pts = regular_polygon([a[2], a[3]], a[4], vertices, 0.0);
      finish(pts, rot(5))
    }
    20 => {
      if !need(6) {
        return Prim::Malformed;
      }
      if clear(a) {
        return Prim::Clear;
      }
      let (x1, y1, x2, y2) = (a[2], a[3], a[4], a[5]);
      let half = a[1].abs() / 2.0;
      let (dx, dy) = (x2 - x1, y2 - y1);
      let len = dx.hypot(dy);
      let (nx, ny) = if len > 0.0 {
        (-dy / len * half, dx / len * half)
      } else {
        (0.0, half)
      };
      let pts = vec![
        [x1 + nx, y1 + ny],
        [x2 + nx, y2 + ny],
        [x2 - nx, y2 - ny],
        [x1 - nx, y1 - ny],
      ];
      finish(pts, rot(6))
    }
    21 => {
      if !need(5) {
        return Prim::Malformed;
      }
      if clear(a) {
        return Prim::Clear;
      }
      let (hw, hh, cx, cy) = (a[1].abs() / 2.0, a[2].abs() / 2.0, a[3], a[4]);
      let pts = vec![
        [cx - hw, cy - hh],
        [cx + hw, cy - hh],
        [cx + hw, cy + hh],
        [cx - hw, cy + hh],
      ];
      finish(pts, rot(5))
    }
    22 => {
      if !need(5) {
        return Prim::Malformed;
      }
      if clear(a) {
        return Prim::Clear;
      }
      let (w, h, x, y) = (a[1].abs(), a[2].abs(), a[3], a[4]);
      let pts = vec![[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      finish(pts, rot(5))
    }
    _ => Prim::Unsupported,
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn def(lines: &[&str]) -> MacroDef {
    MacroDef::from_blocks(lines.iter().copied())
  }

  #[test]
  fn center_line_with_rotation_and_variables() {
    let d = def(&["0 comment", "21,1,$1,$2,0,0,90"]);
    let mut w = Vec::new();
    let shapes = evaluate(&d, &[4.0, 2.0], 1.0, &mut w).unwrap();
    assert!(w.is_empty());
    let FlashShape::Polygon { points } = &shapes[0] else {
      panic!()
    };
    // 4 x 2 rect rotated by 90 degrees becomes 2 x 4.
    let max_x = points.iter().map(|p| p[0]).fold(f64::MIN, f64::max);
    let max_y = points.iter().map(|p| p[1]).fold(f64::MIN, f64::max);
    assert!((max_x - 1.0).abs() < 1e-9 && (max_y - 2.0).abs() < 1e-9);
  }

  #[test]
  fn unsupported_primitive_warns() {
    let d = def(&["6,0,0,1,0.1,0.1,2,0.1,0.1,0"]);
    let mut w = Vec::new();
    assert!(evaluate(&d, &[], 1.0, &mut w).unwrap().is_empty());
    assert_eq!(w.len(), 1);
  }

  #[test]
  fn units_are_scaled() {
    let d = def(&["21,1,1,1,0,0,0"]);
    let mut w = Vec::new();
    let shapes = evaluate(&d, &[], 25.4, &mut w).unwrap();
    let FlashShape::Polygon { points } = &shapes[0] else {
      panic!()
    };
    assert!((points[2][0] - 12.7).abs() < 1e-9);
  }
}
