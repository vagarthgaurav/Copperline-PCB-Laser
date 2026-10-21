//! Board space to machine space. Mirrors `boardTransform` in
//! `src/app/ui/peg-board-viewport/scene-math.ts`, the single placement
//! definition on the Angular side.

use crate::gerber::model::{Bounds, Point};
use serde::Deserialize;

#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Placement {
  /// Machine X of the lower-left corner of the placed board's bounding box.
  pub offset_x: f64,
  /// Machine Y of the lower-left corner of the placed board's bounding box.
  pub offset_y: f64,
  /// Clockwise quarter turns seen from above; only the remainder mod 4 counts.
  pub quarter_turns: u8,
}

/// 2D affine map: x' = a*x + c*y + e, y' = b*x + d*y + f.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Affine {
  pub a: f64,
  pub b: f64,
  pub c: f64,
  pub d: f64,
  pub e: f64,
  pub f: f64,
}

impl Affine {
  pub fn apply(&self, p: Point) -> Point {
    [
      self.a * p[0] + self.c * p[1] + self.e,
      self.b * p[0] + self.d * p[1] + self.f,
    ]
  }
}

/// Order: centre `bounds` on the origin, mirror (x -> -x) if `mirrored`, rotate
/// clockwise by the quarter turns, then translate so the lower-left corner of
/// the resulting bounding box sits at the offset.
pub fn board_transform(bounds: &Bounds, placement: &Placement, mirrored: bool) -> Affine {
  let (mut a, mut b, mut c, mut d) = (if mirrored { -1.0 } else { 1.0 }, 0.0, 0.0, 1.0);
  for _ in 0..placement.quarter_turns % 4 {
    // A clockwise quarter turn is (x, y) -> (y, -x), applied after the current map.
    (a, b, c, d) = (b, -a, d, -c);
  }
  let cx = (bounds.min_x + bounds.max_x) / 2.0;
  let cy = (bounds.min_y + bounds.max_y) / 2.0;
  let centred = Affine {
    a,
    b,
    c,
    d,
    e: -(a * cx + c * cy),
    f: -(b * cx + d * cy),
  };

  let corners = [
    centred.apply([bounds.min_x, bounds.min_y]),
    centred.apply([bounds.max_x, bounds.min_y]),
    centred.apply([bounds.max_x, bounds.max_y]),
    centred.apply([bounds.min_x, bounds.max_y]),
  ];
  let min_x = corners.iter().map(|p| p[0]).fold(f64::INFINITY, f64::min);
  let min_y = corners.iter().map(|p| p[1]).fold(f64::INFINITY, f64::min);
  Affine {
    e: centred.e + placement.offset_x - min_x,
    f: centred.f + placement.offset_y - min_y,
    ..centred
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  /// 10 x 4 mm board from (2, 1) to (12, 5), centre (7, 3).
  const BOARD: Bounds = Bounds {
    min_x: 2.0,
    min_y: 1.0,
    max_x: 12.0,
    max_y: 5.0,
  };

  fn at(offset_x: f64, offset_y: f64, quarter_turns: u8) -> Placement {
    Placement {
      offset_x,
      offset_y,
      quarter_turns,
    }
  }

  fn near(a: Point, b: Point) {
    assert!(
      (a[0] - b[0]).abs() < 1e-9 && (a[1] - b[1]).abs() < 1e-9,
      "{a:?} != {b:?}"
    );
  }

  #[test]
  fn no_transform_moves_the_lower_left_to_the_origin() {
    let m = board_transform(&BOARD, &at(0.0, 0.0, 0), false);
    near(m.apply([2.0, 1.0]), [0.0, 0.0]);
    near(m.apply([12.0, 5.0]), [10.0, 4.0]);
    near(m.apply([7.0, 3.0]), [5.0, 2.0]);
  }

  #[test]
  fn bottom_side_mirrors_x() {
    let m = board_transform(&BOARD, &at(0.0, 0.0, 0), true);
    // The board's left edge ends up on the right.
    near(m.apply([2.0, 1.0]), [10.0, 0.0]);
    near(m.apply([12.0, 1.0]), [0.0, 0.0]);
    near(m.apply([12.0, 5.0]), [0.0, 4.0]);
  }

  #[test]
  fn one_quarter_turn_is_clockwise() {
    let m = board_transform(&BOARD, &at(0.0, 0.0, 1), false);
    // Centred corner (-5, -2) -> (-2, 5); box is 4 x 10 with its lower-left at (-2, -5).
    near(m.apply([2.0, 1.0]), [0.0, 10.0]);
    near(m.apply([12.0, 1.0]), [0.0, 0.0]);
    near(m.apply([12.0, 5.0]), [4.0, 0.0]);
    near(m.apply([2.0, 5.0]), [4.0, 10.0]);
  }

  #[test]
  fn quarter_turns_wrap_at_four() {
    let a = board_transform(&BOARD, &at(1.0, 2.0, 0), false);
    let b = board_transform(&BOARD, &at(1.0, 2.0, 4), false);
    assert_eq!(a, b);
    assert_eq!(
      board_transform(&BOARD, &at(0.0, 0.0, 5), true),
      board_transform(&BOARD, &at(0.0, 0.0, 1), true)
    );
  }

  #[test]
  fn offset_translates_the_result() {
    let m = board_transform(&BOARD, &at(30.0, 20.0, 0), false);
    near(m.apply([2.0, 1.0]), [30.0, 20.0]);
    near(m.apply([12.0, 5.0]), [40.0, 24.0]);
  }

  #[test]
  fn lower_left_of_the_board_box_lands_on_the_offset_for_every_orientation() {
    for mirrored in [false, true] {
      for turns in 0..4 {
        let m = board_transform(&BOARD, &at(12.5, -3.0, turns), mirrored);
        let corners = [[2.0, 1.0], [12.0, 1.0], [12.0, 5.0], [2.0, 5.0]].map(|p| m.apply(p));
        let min_x = corners.iter().map(|p| p[0]).fold(f64::INFINITY, f64::min);
        let min_y = corners.iter().map(|p| p[1]).fold(f64::INFINITY, f64::min);
        near([min_x, min_y], [12.5, -3.0]);
      }
    }
  }

  #[test]
  fn mirror_then_turn_matches_the_typescript_order() {
    // Mirror first: (2, 1) -> centred (-5, -2) -> mirrored (5, -2) -> turned (-2, -5).
    // The turned box spans x -2..2, y -5..5, so the shift is (+2, +5).
    let m = board_transform(&BOARD, &at(0.0, 0.0, 1), true);
    near(m.apply([2.0, 1.0]), [0.0, 0.0]);
    near(m.apply([12.0, 5.0]), [4.0, 10.0]);
  }
}
