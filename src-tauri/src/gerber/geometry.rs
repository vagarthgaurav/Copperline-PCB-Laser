//! Geometry helpers: rounding, arc flattening, shape polygons and bounds.

use super::model::{Bounds, FlashShape, Point, Primitive};
use std::f64::consts::{PI, TAU};

/// Maximum distance between a flattened chord and the true arc, in mm.
pub const CHORD_ERROR_MM: f64 = 0.005;
/// Hard cap on segments per arc or circle.
const MAX_ARC_SEGMENTS: usize = 20_000;

/// Rounds to 1e-6 mm to keep the JSON small and free of float noise.
pub fn round6(v: f64) -> f64 {
  (v * 1e6).round() / 1e6
}

pub fn round_point(p: Point) -> Point {
  [round6(p[0]), round6(p[1])]
}

/// Number of chords needed to cover `sweep` radians on a circle of `radius` mm.
pub fn arc_step_count(radius: f64, sweep: f64) -> usize {
  if !(radius.is_finite() && sweep.is_finite()) || radius <= 0.0 {
    return 1;
  }
  let max_step = 2.0 * (1.0 - CHORD_ERROR_MM / radius).clamp(-1.0, 1.0).acos();
  if max_step <= 0.0 {
    return MAX_ARC_SEGMENTS;
  }
  let steps = (sweep.abs() / max_step).ceil();
  (steps.max(1.0) as usize).min(MAX_ARC_SEGMENTS)
}

/// Points along an arc, excluding `start` and ending exactly at `end`.
/// `sweep` is signed (positive = counter-clockwise). The radius is blended
/// linearly from the start radius to the end radius so slightly inconsistent
/// centres still land on the end point.
pub fn arc_points(center: Point, start: Point, end: Point, sweep: f64) -> Vec<Point> {
  let (sdx, sdy) = (start[0] - center[0], start[1] - center[1]);
  let (edx, edy) = (end[0] - center[0], end[1] - center[1]);
  let (r0, r1) = (sdx.hypot(sdy), edx.hypot(edy));
  let a0 = sdy.atan2(sdx);
  let n = arc_step_count((r0 + r1) / 2.0, sweep);
  let mut points = Vec::with_capacity(n);
  for k in 1..n {
    let t = k as f64 / n as f64;
    let angle = a0 + sweep * t;
    let r = r0 + (r1 - r0) * t;
    points.push([center[0] + r * angle.cos(), center[1] + r * angle.sin()]);
  }
  points.push(end);
  points
}

/// Regular polygon approximating a circle (vertices on the circle).
pub fn circle_polygon(center: Point, radius: f64) -> Vec<Point> {
  let n = arc_step_count(radius, TAU).clamp(8, 256);
  (0..n)
    .map(|k| {
      let a = TAU * k as f64 / n as f64;
      [center[0] + radius * a.cos(), center[1] + radius * a.sin()]
    })
    .collect()
}

/// Regular polygon with `vertices` corners on a circle of `diameter`.
pub fn regular_polygon(
  center: Point,
  diameter: f64,
  vertices: usize,
  rotation_deg: f64,
) -> Vec<Point> {
  let r = diameter / 2.0;
  let rot = rotation_deg.to_radians();
  (0..vertices)
    .map(|k| {
      let a = rot + TAU * k as f64 / vertices as f64;
      [center[0] + r * a.cos(), center[1] + r * a.sin()]
    })
    .collect()
}

pub fn rotate_point(p: Point, rotation_deg: f64) -> Point {
  if rotation_deg == 0.0 {
    return p;
  }
  let (s, c) = rotation_deg.to_radians().sin_cos();
  [p[0] * c - p[1] * s, p[0] * s + p[1] * c]
}

/// Signed sweep (radians) from `start` to `end` around `center`.
/// Coincident points give a full circle when `full_if_closed`, else zero.
pub fn arc_sweep(center: Point, start: Point, end: Point, ccw: bool, full_if_closed: bool) -> f64 {
  let a0 = (start[1] - center[1]).atan2(start[0] - center[0]);
  let a1 = (end[1] - center[1]).atan2(end[0] - center[0]);
  let closed = (start[0] - end[0]).hypot(start[1] - end[1]) < 1e-9;
  if closed {
    return match (full_if_closed, ccw) {
      (false, _) => 0.0,
      (true, true) => TAU,
      (true, false) => -TAU,
    };
  }
  if ccw {
    (a1 - a0).rem_euclid(TAU)
  } else {
    -((a0 - a1).rem_euclid(TAU))
  }
}

/// True when `sweep` stays within one quadrant (with a little slack).
pub fn within_quadrant(sweep: f64) -> bool {
  sweep.abs() <= PI / 2.0 + 1e-3
}

#[derive(Debug, Clone, Copy)]
pub struct BoundsBuilder(Option<Bounds>);

impl BoundsBuilder {
  pub fn new() -> Self {
    BoundsBuilder(None)
  }

  pub fn include(&mut self, x: f64, y: f64) {
    match &mut self.0 {
      None => {
        self.0 = Some(Bounds {
          min_x: x,
          min_y: y,
          max_x: x,
          max_y: y,
        });
      }
      Some(b) => {
        b.min_x = b.min_x.min(x);
        b.min_y = b.min_y.min(y);
        b.max_x = b.max_x.max(x);
        b.max_y = b.max_y.max(y);
      }
    }
  }

  pub fn include_box(&mut self, cx: f64, cy: f64, hx: f64, hy: f64) {
    self.include(cx - hx, cy - hy);
    self.include(cx + hx, cy + hy);
  }

  pub fn include_bounds(&mut self, b: &Bounds) {
    self.include(b.min_x, b.min_y);
    self.include(b.max_x, b.max_y);
  }

  /// The accumulated bounds, rounded like the coordinates.
  pub fn build(self) -> Option<Bounds> {
    self.0.map(|b| Bounds {
      min_x: round6(b.min_x),
      min_y: round6(b.min_y),
      max_x: round6(b.max_x),
      max_y: round6(b.max_y),
    })
  }
}

/// Half extents of a flash shape around its origin.
fn shape_half_extents(shape: &FlashShape) -> (f64, f64) {
  match shape {
    FlashShape::Circle { diameter } => (diameter / 2.0, diameter / 2.0),
    FlashShape::Rect {
      width,
      height,
      rotation,
    } => {
      let (s, c) = rotation.to_radians().sin_cos();
      (
        (width * c.abs() + height * s.abs()) / 2.0,
        (width * s.abs() + height * c.abs()) / 2.0,
      )
    }
    FlashShape::Obround {
      width,
      height,
      rotation,
    } => {
      let (s, c) = rotation.to_radians().sin_cos();
      // A stadium: a segment along its long axis swept by a circle.
      let (long, short, axis_c, axis_s) = if width >= height {
        (*width, *height, c, s)
      } else {
        (*height, *width, s, c)
      };
      let half = (long - short) / 2.0;
      let r = short / 2.0;
      (half * axis_c.abs() + r, half * axis_s.abs() + r)
    }
    FlashShape::Polygon { .. } => (0.0, 0.0),
  }
}

/// Bounds of primitives. With `stroke` the line width and aperture size are
/// included (layer bounds); without it only the centre lines count.
pub fn primitives_bounds(primitives: &[Primitive], stroke: bool) -> Option<Bounds> {
  let mut b = BoundsBuilder::new();
  for p in primitives {
    match p {
      Primitive::Draw { from, to, width } => {
        let h = if stroke { width / 2.0 } else { 0.0 };
        b.include_box(from[0], from[1], h, h);
        b.include_box(to[0], to[1], h, h);
      }
      Primitive::Flash { at, shape } => match shape {
        FlashShape::Polygon { points } => {
          for q in points {
            b.include(at[0] + q[0], at[1] + q[1]);
          }
        }
        _ => {
          let (hx, hy) = if stroke {
            shape_half_extents(shape)
          } else {
            (0.0, 0.0)
          };
          b.include_box(at[0], at[1], hx, hy);
        }
      },
      Primitive::Region { points } => {
        for q in points {
          b.include(q[0], q[1]);
        }
      }
      Primitive::Hole { at, diameter } => {
        let h = if stroke { diameter / 2.0 } else { 0.0 };
        b.include_box(at[0], at[1], h, h);
      }
    }
  }
  b.build()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn arc_chord_error_is_bounded() {
    let r = 5.0;
    let n = arc_step_count(r, TAU);
    let step = TAU / n as f64;
    let error = r * (1.0 - (step / 2.0).cos());
    assert!(error <= CHORD_ERROR_MM + 1e-9, "error {error}");
  }

  #[test]
  fn arc_step_count_is_capped() {
    assert_eq!(arc_step_count(1e9, TAU), MAX_ARC_SEGMENTS);
    assert_eq!(arc_step_count(0.0, TAU), 1);
    assert_eq!(arc_step_count(f64::NAN, TAU), 1);
  }

  #[test]
  fn arc_points_end_exactly() {
    let pts = arc_points([0.0, 0.0], [1.0, 0.0], [0.0, 1.0], PI / 2.0);
    assert_eq!(*pts.last().unwrap(), [0.0, 1.0]);
    assert!(pts.len() > 1);
  }
}
