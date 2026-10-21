//! Machine-space contours to a toolpath: rounding, simplification, ordering
//! and statistics. Everything here is deterministic.

use super::GcodeStats;
use super::isolation::Contour;
use crate::gerber::model::{Bounds, Point};

/// Douglas-Peucker tolerance in mm.
const SIMPLIFY_TOLERANCE_MM: f64 = 0.002;

/// Rounds to the 3 decimals that are written to the G-code (never -0).
pub fn round3(v: f64) -> f64 {
  let r = (v * 1000.0).round() / 1000.0;
  if r == 0.0 { 0.0 } else { r }
}

/// Rounds coordinates, removes repeated points and straightens near-collinear
/// runs. Contours left with fewer than 3 points are dropped.
pub fn simplify(contours: Vec<Contour>) -> Vec<Contour> {
  contours
    .into_iter()
    .map(|contour| {
      let mut points: Contour = Vec::with_capacity(contour.len());
      for p in contour {
        let p = [round3(p[0]), round3(p[1])];
        if points.last() != Some(&p) {
          points.push(p);
        }
      }
      while points.len() > 1 && points.first() == points.last() {
        points.pop();
      }
      simplify_ring(&points)
    })
    .filter(|contour| contour.len() >= 3)
    .collect()
}

/// Douglas-Peucker on a closed ring: split at the vertex farthest from the
/// first one so both halves are open chains with fixed ends.
fn simplify_ring(ring: &[Point]) -> Contour {
  if ring.len() < 4 {
    return ring.to_vec();
  }
  let mut far = 0;
  let mut far_dist = 0.0;
  for (i, p) in ring.iter().enumerate() {
    let d = (p[0] - ring[0][0]).hypot(p[1] - ring[0][1]);
    if d > far_dist {
      far = i;
      far_dist = d;
    }
  }
  let mut second = ring[far..].to_vec();
  second.push(ring[0]);
  let mut out = douglas_peucker(&ring[..=far]);
  let tail = douglas_peucker(&second);
  out.extend_from_slice(&tail[1..tail.len() - 1]);
  out
}

fn douglas_peucker(chain: &[Point]) -> Vec<Point> {
  let n = chain.len();
  if n < 3 {
    return chain.to_vec();
  }
  let mut keep = vec![false; n];
  keep[0] = true;
  keep[n - 1] = true;
  let mut stack = vec![(0, n - 1)];
  while let Some((lo, hi)) = stack.pop() {
    let mut worst = lo;
    let mut worst_dist = SIMPLIFY_TOLERANCE_MM;
    for i in lo + 1..hi {
      let d = distance_to_segment(chain[i], chain[lo], chain[hi]);
      if d > worst_dist {
        worst = i;
        worst_dist = d;
      }
    }
    if worst != lo {
      keep[worst] = true;
      stack.push((lo, worst));
      stack.push((worst, hi));
    }
  }
  chain
    .iter()
    .zip(keep)
    .filter(|(_, k)| *k)
    .map(|(p, _)| *p)
    .collect()
}

fn distance_to_segment(p: Point, a: Point, b: Point) -> f64 {
  let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
  let len2 = dx * dx + dy * dy;
  if len2 == 0.0 {
    return (p[0] - a[0]).hypot(p[1] - a[1]);
  }
  let t = (((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2).clamp(0.0, 1.0);
  (p[0] - (a[0] + t * dx)).hypot(p[1] - (a[1] + t * dy))
}

/// Greedy nearest-neighbour order starting from the machine origin. Each
/// contour is rotated to start at its vertex nearest the head, which a closed
/// contour then returns to. Ties go to the earlier contour and vertex.
pub fn order(mut remaining: Vec<Contour>) -> Vec<Contour> {
  let mut boxes: Vec<Bounds> = remaining.iter().map(|c| bounds_of(c)).collect();
  let mut head = [0.0, 0.0];
  let mut ordered = Vec::with_capacity(remaining.len());
  while !remaining.is_empty() {
    let mut best = (f64::INFINITY, 0, 0);
    for (i, contour) in remaining.iter().enumerate() {
      // The box distance is a lower bound: skip contours that cannot win.
      if distance_to_box(head, &boxes[i]) > best.0 {
        continue;
      }
      for (v, p) in contour.iter().enumerate() {
        let d = (p[0] - head[0]).hypot(p[1] - head[1]);
        if d < best.0 {
          best = (d, i, v);
        }
      }
    }
    let (_, index, vertex) = best;
    boxes.remove(index);
    let mut contour = remaining.remove(index);
    contour.rotate_left(vertex);
    head = contour[0];
    ordered.push(contour);
  }
  ordered
}

fn distance_to_box(p: Point, b: &Bounds) -> f64 {
  let dx = (b.min_x - p[0]).max(p[0] - b.max_x).max(0.0);
  let dy = (b.min_y - p[1]).max(p[1] - b.max_y).max(0.0);
  dx.hypot(dy)
}

fn bounds_of(contour: &[Point]) -> Bounds {
  let mut b = Bounds {
    min_x: f64::INFINITY,
    min_y: f64::INFINITY,
    max_x: f64::NEG_INFINITY,
    max_y: f64::NEG_INFINITY,
  };
  for p in contour {
    b.min_x = b.min_x.min(p[0]);
    b.min_y = b.min_y.min(p[1]);
    b.max_x = b.max_x.max(p[0]);
    b.max_y = b.max_y.max(p[1]);
  }
  b
}

/// Lengths, time estimate and extent of an ordered toolpath that starts at
/// the origin and returns to each contour's start point. `contours` must not
/// be empty.
pub fn stats(contours: &[Contour], feed_rate: f64, rapid_rate: f64) -> GcodeStats {
  let mut engrave = 0.0;
  let mut rapid = 0.0;
  let mut head = [0.0, 0.0];
  for contour in contours {
    rapid += (contour[0][0] - head[0]).hypot(contour[0][1] - head[1]);
    for (i, p) in contour.iter().enumerate() {
      let q = contour[(i + 1) % contour.len()];
      engrave += (q[0] - p[0]).hypot(q[1] - p[1]);
    }
    head = contour[0];
  }
  let mut all = contours.iter().flatten().copied();
  let first = all.next().unwrap_or([0.0, 0.0]);
  let bounds = all.fold(
    Bounds {
      min_x: first[0],
      min_y: first[1],
      max_x: first[0],
      max_y: first[1],
    },
    |b, p| Bounds {
      min_x: b.min_x.min(p[0]),
      min_y: b.min_y.min(p[1]),
      max_x: b.max_x.max(p[0]),
      max_y: b.max_y.max(p[1]),
    },
  );
  GcodeStats {
    contour_count: contours.len(),
    engrave_length_mm: round3(engrave),
    rapid_length_mm: round3(rapid),
    estimated_seconds: ((engrave / feed_rate + rapid / rapid_rate) * 600.0).round() / 10.0,
    bounds,
  }
}
