//! Isolation contours: the copper of one layer is unioned into polygons with
//! holes, then grown outward once per pass. Every boundary of every grown
//! shape (outer edges and hole edges) is a beam centre line.

use crate::gerber::geometry::arc_step_count;
use crate::gerber::model::{FlashShape, Point, Primitive};
use clipper2_rust::{
  EndType, FillRule, JoinType, PathD, PathsD, PointD, inflate_paths_d, union_subjects_d,
};
use std::f64::consts::{PI, TAU};

/// A closed polyline; the closing segment from last to first is implicit.
pub type Contour = Vec<Point>;

/// Clipper works on integers: coordinates are scaled by 10^PRECISION (0.1 um).
const PRECISION: i32 = 4;
/// Maximum distance between a rounded offset corner and the true arc, in mm.
const ARC_TOLERANCE_MM: f64 = 0.005;
/// Only used by mitered joins, which are not requested.
const MITER_LIMIT: f64 = 2.0;
/// Polygons with less area than this (mm^2) are degenerate.
const MIN_AREA: f64 = 1e-12;

/// The contours of each pass, outermost pass last. A pass that produces
/// nothing is an empty list. Coordinates stay in board space.
pub fn isolation_passes<'a>(
  primitives: impl IntoIterator<Item = &'a Primitive>,
  spot: f64,
  passes: u32,
  overlap: f64,
) -> Vec<Vec<Contour>> {
  let copper = copper_union(primitives);
  let pitch = spot * (1.0 - overlap);
  (0..passes)
    .map(|k| {
      if copper.is_empty() {
        return Vec::new();
      }
      let delta = spot / 2.0 + f64::from(k) * pitch;
      inflate_paths_d(
        &copper,
        delta,
        JoinType::Round,
        EndType::Polygon,
        MITER_LIMIT,
        PRECISION,
        ARC_TOLERANCE_MM,
      )
      .into_iter()
      .filter(|path| path.len() >= 3)
      .map(|path| path.into_iter().map(|p| [p.x, p.y]).collect())
      .collect()
    })
    .collect()
}

/// All copper as one set of non-overlapping polygons (outer boundaries
/// counter-clockwise, holes clockwise).
fn copper_union<'a>(primitives: impl IntoIterator<Item = &'a Primitive>) -> PathsD {
  let subjects: PathsD = primitives
    .into_iter()
    .filter_map(primitive_polygon)
    .map(|polygon| {
      polygon
        .into_iter()
        .map(|p| PointD::new(p[0], p[1]))
        .collect::<PathD>()
    })
    .collect();
  if subjects.is_empty() {
    return PathsD::new();
  }
  union_subjects_d(&subjects, FillRule::NonZero, PRECISION)
}

/// The filled outline of a primitive, counter-clockwise, or `None` when it has
/// no area (or is a drill hole, which is not copper).
fn primitive_polygon(primitive: &Primitive) -> Option<Contour> {
  let polygon = match primitive {
    Primitive::Draw { from, to, width } => capsule(*from, *to, width / 2.0),
    Primitive::Flash { at, shape } => flash_polygon(*at, shape),
    Primitive::Region { points } => points.clone(),
    Primitive::Hole { .. } => return None,
  };
  counter_clockwise(polygon)
}

fn flash_polygon(at: Point, shape: &FlashShape) -> Contour {
  match shape {
    FlashShape::Circle { diameter } => capsule(at, at, diameter / 2.0),
    FlashShape::Rect {
      width,
      height,
      rotation,
    } => {
      let (s, c) = rotation.to_radians().sin_cos();
      let (hw, hh) = (width / 2.0, height / 2.0);
      [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]
        .map(|[x, y]| [at[0] + x * c - y * s, at[1] + x * s + y * c])
        .to_vec()
    }
    FlashShape::Obround {
      width,
      height,
      rotation,
    } => {
      let (s, c) = rotation.to_radians().sin_cos();
      let (axis, half, r) = if width >= height {
        ([c, s], (width - height) / 2.0, height / 2.0)
      } else {
        ([-s, c], (height - width) / 2.0, width / 2.0)
      };
      capsule(
        [at[0] - axis[0] * half, at[1] - axis[1] * half],
        [at[0] + axis[0] * half, at[1] + axis[1] * half],
        r,
      )
    }
    FlashShape::Polygon { points } => points
      .iter()
      .map(|q| [at[0] + q[0], at[1] + q[1]])
      .collect(),
  }
}

/// A line of width `2 * radius` with round caps (a stadium); a circle when
/// the ends coincide. Counter-clockwise.
fn capsule(from: Point, to: Point, radius: f64) -> Contour {
  if !(radius > 0.0 && radius.is_finite()) {
    return Vec::new();
  }
  let (dx, dy) = (to[0] - from[0], to[1] - from[1]);
  let length = dx.hypot(dy);
  if length < 1e-9 {
    let n = arc_step_count(radius, TAU).clamp(8, 256);
    return (0..n)
      .map(|k| {
        let a = TAU * k as f64 / n as f64;
        [from[0] + radius * a.cos(), from[1] + radius * a.sin()]
      })
      .collect();
  }
  let heading = dy.atan2(dx);
  let n = arc_step_count(radius, PI).clamp(4, 128);
  let mut points = Vec::with_capacity(2 * (n + 1));
  // Cap around `from` (facing backwards), then the cap around `to`.
  for (centre, start) in [(from, heading + PI / 2.0), (to, heading - PI / 2.0)] {
    for k in 0..=n {
      let a = start + PI * k as f64 / n as f64;
      points.push([centre[0] + radius * a.cos(), centre[1] + radius * a.sin()]);
    }
  }
  points
}

/// Drops non-finite or degenerate polygons and reverses clockwise ones.
fn counter_clockwise(mut polygon: Contour) -> Option<Contour> {
  if polygon.len() < 3
    || polygon
      .iter()
      .any(|p| !(p[0].is_finite() && p[1].is_finite()))
  {
    return None;
  }
  let area = signed_area(&polygon);
  if area.abs() < MIN_AREA {
    return None;
  }
  if area < 0.0 {
    polygon.reverse();
  }
  Some(polygon)
}

pub fn signed_area(polygon: &[Point]) -> f64 {
  let mut sum = 0.0;
  for (i, p) in polygon.iter().enumerate() {
    let q = polygon[(i + 1) % polygon.len()];
    sum += p[0] * q[1] - q[0] * p[1];
  }
  sum / 2.0
}

#[cfg(test)]
mod tests {
  use super::*;

  fn square(x0: f64, y0: f64, x1: f64, y1: f64) -> Primitive {
    Primitive::Region {
      points: vec![[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
    }
  }

  fn bbox(contour: &Contour) -> (f64, f64, f64, f64) {
    let xs = contour.iter().map(|p| p[0]);
    let ys = contour.iter().map(|p| p[1]);
    (
      xs.clone().fold(f64::INFINITY, f64::min),
      ys.clone().fold(f64::INFINITY, f64::min),
      xs.fold(f64::NEG_INFINITY, f64::max),
      ys.fold(f64::NEG_INFINITY, f64::max),
    )
  }

  fn close(a: f64, b: f64) -> bool {
    (a - b).abs() < 0.006
  }

  #[test]
  fn square_region_grows_by_half_the_spot() {
    let passes = isolation_passes(&[square(0.0, 0.0, 1.0, 1.0)], 0.1, 1, 0.3);
    assert_eq!(passes.len(), 1);
    assert_eq!(passes[0].len(), 1);
    let (x0, y0, x1, y1) = bbox(&passes[0][0]);
    assert!(close(x0, -0.05) && close(y0, -0.05) && close(x1, 1.05) && close(y1, 1.05));
    // Centred on the square.
    assert!(close((x0 + x1) / 2.0, 0.5) && close((y0 + y1) / 2.0, 0.5));
  }

  #[test]
  fn clockwise_regions_work_too() {
    let cw = Primitive::Region {
      points: vec![[0.0, 0.0], [0.0, 1.0], [1.0, 1.0], [1.0, 0.0]],
    };
    let passes = isolation_passes(&[cw], 0.1, 1, 0.3);
    let (x0, _, x1, _) = bbox(&passes[0][0]);
    assert!(close(x0, -0.05) && close(x1, 1.05));
  }

  #[test]
  fn extra_passes_nest_outward_by_the_pitch() {
    let passes = isolation_passes(&[square(0.0, 0.0, 1.0, 1.0)], 0.1, 2, 0.3);
    assert_eq!(passes.len(), 2);
    assert!(passes.iter().all(|p| p.len() == 1));
    // Second pass: 0.05 + 0.1 * 0.7 = 0.12 from the copper edge.
    let (x0, _, x1, _) = bbox(&passes[1][0]);
    assert!(close(x0, -0.12) && close(x1, 1.12));
    assert!(bbox(&passes[0][0]).0 > x0);
  }

  #[test]
  fn ring_gives_an_outer_and_a_hole_contour() {
    // A 3 x 3 mm frame (four bars) around a 1 x 1 mm gap.
    let bars = [
      square(0.0, 0.0, 3.0, 1.0),
      square(0.0, 2.0, 3.0, 3.0),
      square(0.0, 1.0, 1.0, 2.0),
      square(2.0, 1.0, 3.0, 2.0),
    ];
    let passes = isolation_passes(&bars, 0.1, 1, 0.3);
    assert_eq!(passes[0].len(), 2, "outer and hole");
    let mut boxes: Vec<_> = passes[0].iter().map(bbox).collect();
    boxes.sort_by(|a, b| a.0.total_cmp(&b.0));
    assert!(close(boxes[0].0, -0.05) && close(boxes[0].2, 3.05));
    // The hole boundary is the gap shrunk by half the spot on every side.
    assert!(close(boxes[1].0, 1.05) && close(boxes[1].2, 1.95));
  }

  #[test]
  fn a_hole_smaller_than_the_spot_disappears() {
    let bars = [
      square(0.0, 0.0, 3.0, 1.0),
      square(0.0, 1.08, 3.0, 3.0),
      square(0.0, 1.0, 1.0, 1.08),
      square(2.0, 1.0, 3.0, 1.08),
    ];
    // The gaps are 0.08 mm: a 0.2 mm spot cannot enter them.
    let passes = isolation_passes(&bars, 0.2, 1, 0.3);
    assert_eq!(passes[0].len(), 1);
  }

  #[test]
  fn overlapping_draws_union_into_one_contour() {
    let draws = [
      Primitive::Draw {
        from: [0.0, 0.0],
        to: [2.0, 0.0],
        width: 0.2,
      },
      Primitive::Draw {
        from: [1.0, -1.0],
        to: [1.0, 1.0],
        width: 0.2,
      },
    ];
    let passes = isolation_passes(&draws, 0.1, 1, 0.3);
    assert_eq!(passes[0].len(), 1);
    // A plus sign: the grown outline reaches 0.15 mm beyond the line ends.
    let (x0, y0, x1, y1) = bbox(&passes[0][0]);
    assert!(close(x0, -0.15) && close(x1, 2.15) && close(y0, -1.15) && close(y1, 1.15));
  }

  #[test]
  fn separate_copper_gives_separate_contours() {
    let passes = isolation_passes(
      &[square(0.0, 0.0, 1.0, 1.0), square(5.0, 0.0, 6.0, 1.0)],
      0.1,
      1,
      0.3,
    );
    assert_eq!(passes[0].len(), 2);
  }

  #[test]
  fn a_draw_is_a_capsule() {
    let capsule = primitive_polygon(&Primitive::Draw {
      from: [0.0, 0.0],
      to: [4.0, 0.0],
      width: 1.0,
    })
    .unwrap();
    let (x0, y0, x1, y1) = bbox(&capsule);
    assert!(close(x0, -0.5) && close(x1, 4.5) && close(y0, -0.5) && close(y1, 0.5));
    assert!((signed_area(&capsule) - (4.0 + PI * 0.25)).abs() < 0.05);
  }

  #[test]
  fn a_diagonal_draw_has_round_caps() {
    let capsule = primitive_polygon(&Primitive::Draw {
      from: [0.0, 0.0],
      to: [3.0, 4.0],
      width: 2.0,
    })
    .unwrap();
    assert!((signed_area(&capsule) - (5.0 * 2.0 + PI)).abs() < 0.1);
  }

  #[test]
  fn shapes_cover_their_apertures() {
    let rect = |rotation| {
      let flash = Primitive::Flash {
        at: [1.0, 2.0],
        shape: FlashShape::Rect {
          width: 4.0,
          height: 2.0,
          rotation,
        },
      };
      bbox(&primitive_polygon(&flash).unwrap())
    };
    let (x0, y0, x1, y1) = rect(0.0);
    assert!(close(x0, -1.0) && close(x1, 3.0) && close(y0, 1.0) && close(y1, 3.0));
    let (x0, y0, x1, y1) = rect(90.0);
    assert!(close(x0, 0.0) && close(x1, 2.0) && close(y0, 0.0) && close(y1, 4.0));

    // Round ends lie on the longer axis, whichever way the aperture is written.
    let obround = |width, height, rotation| {
      let flash = Primitive::Flash {
        at: [0.0, 0.0],
        shape: FlashShape::Obround {
          width,
          height,
          rotation,
        },
      };
      bbox(&primitive_polygon(&flash).unwrap())
    };
    let (x0, y0, x1, y1) = obround(4.0, 2.0, 0.0);
    assert!(close(x0, -2.0) && close(x1, 2.0) && close(y0, -1.0) && close(y1, 1.0));
    let (x0, y0, x1, y1) = obround(2.0, 4.0, 0.0);
    assert!(close(x0, -1.0) && close(x1, 1.0) && close(y0, -2.0) && close(y1, 2.0));
    let (x0, y0, x1, y1) = obround(4.0, 2.0, 90.0);
    assert!(close(x0, -1.0) && close(x1, 1.0) && close(y0, -2.0) && close(y1, 2.0));

    let circle = Primitive::Flash {
      at: [1.0, 1.0],
      shape: FlashShape::Circle { diameter: 2.0 },
    };
    let (x0, y0, x1, y1) = bbox(&primitive_polygon(&circle).unwrap());
    assert!(close(x0, 0.0) && close(x1, 2.0) && close(y0, 0.0) && close(y1, 2.0));

    // Polygon points are relative to the flash position.
    let triangle = Primitive::Flash {
      at: [10.0, 10.0],
      shape: FlashShape::Polygon {
        points: vec![[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]],
      },
    };
    let (x0, y0, x1, y1) = bbox(&primitive_polygon(&triangle).unwrap());
    assert!(close(x0, 10.0) && close(x1, 11.0) && close(y0, 10.0) && close(y1, 11.0));
  }

  #[test]
  fn holes_and_degenerate_primitives_are_ignored() {
    let ignored = [
      Primitive::Hole {
        at: [0.0, 0.0],
        diameter: 1.0,
      },
      Primitive::Draw {
        from: [0.0, 0.0],
        to: [1.0, 0.0],
        width: 0.0,
      },
      Primitive::Region {
        points: vec![[0.0, 0.0], [1.0, 0.0]],
      },
      Primitive::Region {
        points: vec![[0.0, 0.0], [1.0, 1.0], [2.0, 2.0]],
      },
      Primitive::Region {
        points: vec![[0.0, 0.0], [f64::NAN, 1.0], [2.0, 0.0]],
      },
    ];
    let passes = isolation_passes(&ignored, 0.1, 2, 0.3);
    assert_eq!(passes.len(), 2);
    assert!(passes.iter().all(Vec::is_empty));
  }
}
