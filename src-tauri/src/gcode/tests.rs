//! Tests of `generate` and the emitter on small synthetic boards.

use super::emit::{emit, num, spindle_value};
use super::isolation::Contour;
use super::*;
use crate::gerber::model::{BoardInfo, BoardSource, ParsedLayer, Primitive};

fn layer(kind: LayerKind, primitives: Vec<Primitive>) -> ParsedLayer {
  ParsedLayer {
    id: "layer".into(),
    file_name: "layer".into(),
    kind,
    label: kind.label().into(),
    bounds: Bounds {
      min_x: 0.0,
      min_y: 0.0,
      max_x: 1.0,
      max_y: 1.0,
    },
    primitive_count: primitives.len(),
    warnings: Vec::new(),
    primitives,
  }
}

fn square(x0: f64, y0: f64, x1: f64, y1: f64) -> Primitive {
  Primitive::Region {
    points: vec![[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
  }
}

/// A 10 x 10 board with a 1 mm pad at (2..3, 2..3) and another at (7..8, 7..8).
fn project(kind: LayerKind) -> ParsedProject {
  ParsedProject {
    name: "demo".into(),
    layers: vec![layer(
      kind,
      vec![square(2.0, 2.0, 3.0, 3.0), square(7.0, 7.0, 8.0, 8.0)],
    )],
    skipped: Vec::new(),
    board: Some(BoardInfo {
      bounds: Bounds {
        min_x: 0.0,
        min_y: 0.0,
        max_x: 10.0,
        max_y: 10.0,
      },
      source: BoardSource::Outline,
      width: 10.0,
      height: 10.0,
    }),
  }
}

fn request() -> GcodeRequest {
  GcodeRequest {
    dialect: Dialect::GrblHal,
    side: BoardSide::Top,
    placement: Placement {
      offset_x: 0.0,
      offset_y: 0.0,
      quarter_turns: 0,
    },
    power_percent: 65.0,
    feed_rate: 1200.0,
    rapid_rate: None,
    spot_diameter: 0.1,
    isolation_passes: 1,
    pass_overlap: 0.3,
    spindle_max: 1000.0,
  }
}

fn run(request: &GcodeRequest) -> GcodeOutput {
  generate(&project(LayerKind::TopCopper), request).expect("generates")
}

fn error(project: &ParsedProject, request: &GcodeRequest) -> String {
  generate(project, request).expect_err("should fail")
}

/// X and Y of a G0/G1 line.
fn xy(line: &str) -> (f64, f64) {
  let word = |letter: char| {
    line
      .split_whitespace()
      .find_map(|w| w.strip_prefix(letter))
      .and_then(|v| v.parse().ok())
      .unwrap_or_else(|| panic!("no {letter} in {line}"))
  };
  (word('X'), word('Y'))
}

#[test]
fn header_and_footer() {
  let out = run(&request());
  let lines = &out.lines;
  assert_eq!(
    lines[0],
    "; Copperline isolation: demo, top copper, 1 pass, 0.1 mm spot, 0.3 overlap"
  );
  assert_eq!(
    lines[1],
    "; dialect grblHAL  power 65 % -> S650  feed 1200 mm/min"
  );
  assert!(lines[2].starts_with("; "));
  assert_eq!(&lines[3..8], ["G21", "G90", "G17", "G94", "M5"]);
  assert!(lines[8].starts_with("G0 X"));
  assert_eq!(lines[9], "M4 S0");
  assert_eq!(&lines[lines.len() - 2..], ["M5", "M30"]);
  assert!(
    lines
      .iter()
      .all(|l| !l.contains("-0 ") && !l.ends_with("-0"))
  );
}

#[test]
fn contours_are_closed_and_cut_with_g1() {
  let out = run(&request());
  assert_eq!(out.stats.contour_count, 2);
  let mut start = None;
  let mut cuts_in_contour = 0;
  let mut contours = 0;
  for line in &out.lines {
    if line.starts_with("G0 ") {
      start = Some(xy(line));
      cuts_in_contour = 0;
    } else if line.starts_with("G1 ") {
      cuts_in_contour += 1;
      // Each contour ends on the point it started from.
      if let Some(s) = start {
        let (x, y) = xy(line);
        if (x, y) == s && cuts_in_contour > 2 {
          contours += 1;
        }
      }
    }
  }
  assert_eq!(contours, 2);
}

#[test]
fn feed_and_power_are_written_once() {
  let out = run(&request());
  let cuts: Vec<_> = out.lines.iter().filter(|l| l.starts_with("G1 ")).collect();
  assert!(cuts[0].ends_with("F1200 S650"), "{}", cuts[0]);
  assert_eq!(cuts.iter().filter(|l| l.contains('F')).count(), 1);
  assert_eq!(cuts.iter().filter(|l| l.contains('S')).count(), 1);
  assert!(
    out
      .lines
      .iter()
      .filter(|l| l.starts_with("G0 "))
      .all(|l| !l.contains('F') && !l.contains('S'))
  );
}

#[test]
fn s_scales_with_spindle_max() {
  let mut r = request();
  r.spindle_max = 255.0;
  r.power_percent = 50.0;
  assert_eq!(spindle_value(&r), 128);
  let out = run(&r);
  assert!(out.lines.iter().any(|l| l.contains("F1200 S128")));
  assert!(out.lines[1].contains("S128"));
  r.spindle_max = 10000.0;
  r.power_percent = 12.5;
  assert_eq!(spindle_value(&r), 1250);
}

#[test]
fn f_and_s_are_repeated_only_when_they_change() {
  // The emitter writes them whenever they differ from the last values.
  let contours: Vec<Contour> = vec![
    vec![[1.0, 1.0], [2.0, 1.0], [2.0, 2.0]],
    vec![[5.0, 5.0], [6.0, 5.0], [6.0, 6.0]],
  ];
  let lines = emit(&contours, &request(), "x");
  let cuts: Vec<_> = lines.iter().filter(|l| l.starts_with("G1 ")).collect();
  assert_eq!(cuts.len(), 6);
  assert_eq!(cuts[0], &"G1 X2 Y1 F1200 S650");
  assert!(
    cuts[1..]
      .iter()
      .all(|l| !l.contains('F') && !l.contains('S'))
  );
}

#[test]
fn number_formatting() {
  assert_eq!(num(12.5), "12.5");
  assert_eq!(num(3.0), "3");
  assert_eq!(num(0.0), "0");
  assert_eq!(num(-0.0), "0");
  assert_eq!(num(-0.0004), "0");
  assert_eq!(num(-0.0006), "-0.001");
  assert_eq!(num(1.23456), "1.235");
  assert_eq!(num(100.0), "100");
  assert_eq!(num(-7.10), "-7.1");
}

#[test]
fn header_text_cannot_break_out_of_the_comment() {
  let lines = emit(
    &[vec![[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]]],
    &request(),
    "a\nM3 S1000(x)",
  );
  assert!(lines[0].starts_with("; Copperline isolation: a M3 S1000 x "));
  assert_eq!(lines.iter().filter(|l| l.as_str() == "M3 S1000").count(), 0);
}

#[test]
fn output_is_deterministic() {
  assert_eq!(run(&request()), run(&request()));
}

#[test]
fn contours_are_visited_nearest_first_from_the_origin() {
  let out = run(&request());
  let starts: Vec<_> = out
    .lines
    .iter()
    .filter(|l| l.starts_with("G0 "))
    .map(|l| xy(l))
    .collect();
  assert_eq!(starts.len(), 2);
  // The pad near (2, 2) is closer to the origin than the one near (7, 7).
  assert!(starts[0].0 < 4.0 && starts[1].0 > 6.0, "{starts:?}");
  // The start is the vertex nearest the origin: the lower-left of the grown pad.
  assert!(starts[0].0 < 2.0 && starts[0].1 < 2.0, "{starts:?}");
}

#[test]
fn stats_match_the_toolpath() {
  let out = run(&request());
  // Two grown 1 mm squares: each about 4 * 1 + 2 * pi * 0.05 long.
  let expected = 2.0 * (4.0 + 2.0 * std::f64::consts::PI * 0.05);
  assert!(
    (out.stats.engrave_length_mm - expected).abs() < 0.05,
    "{}",
    out.stats.engrave_length_mm
  );
  assert!(out.stats.rapid_length_mm > 2.0 && out.stats.rapid_length_mm < 15.0);
  let seconds =
    out.stats.engrave_length_mm / 1200.0 * 60.0 + out.stats.rapid_length_mm / 3000.0 * 60.0;
  assert!((out.stats.estimated_seconds - seconds).abs() < 0.06);
  let b = out.stats.bounds;
  assert!((b.min_x - 1.95).abs() < 0.01 && (b.max_y - 8.05).abs() < 0.01);
  assert!(out.warnings.is_empty(), "{:?}", out.warnings);
}

#[test]
fn rapid_rate_only_changes_the_estimate() {
  let slow = run(&GcodeRequest {
    rapid_rate: Some(600.0),
    ..request()
  });
  let fast = run(&request());
  assert_eq!(slow.lines, fast.lines);
  assert!(slow.stats.estimated_seconds > fast.stats.estimated_seconds);
}

#[test]
fn more_passes_add_contours() {
  let out = run(&GcodeRequest {
    isolation_passes: 3,
    ..request()
  });
  assert_eq!(out.stats.contour_count, 6);
  assert!(out.lines[0].contains("3 passes"));
}

#[test]
fn placement_moves_the_toolpath() {
  let out = run(&GcodeRequest {
    placement: Placement {
      offset_x: 100.0,
      offset_y: 50.0,
      quarter_turns: 0,
    },
    ..request()
  });
  let b = out.stats.bounds;
  assert!((b.min_x - 101.95).abs() < 0.01 && (b.min_y - 51.95).abs() < 0.01);
}

#[test]
fn bottom_side_is_mirrored_and_uses_the_bottom_layer() {
  let mut project = project(LayerKind::BottomCopper);
  project.layers[0].primitives = vec![square(1.0, 1.0, 2.0, 2.0)];
  let out = generate(
    &project,
    &GcodeRequest {
      side: BoardSide::Bottom,
      ..request()
    },
  )
  .expect("generates");
  let b = out.stats.bounds;
  // On a 10 mm board x 1..2 mirrors to 8..9; y is unchanged.
  assert!(
    (b.min_x - 7.95).abs() < 0.01 && (b.max_x - 9.05).abs() < 0.01,
    "{b:?}"
  );
  assert!(
    (b.min_y - 0.95).abs() < 0.01 && (b.max_y - 2.05).abs() < 0.01,
    "{b:?}"
  );
  assert!(out.lines[0].contains("bottom copper"));
}

#[test]
fn quarter_turn_rotates_the_toolpath() {
  let mut project = project(LayerKind::TopCopper);
  project.layers[0].primitives = vec![square(1.0, 1.0, 2.0, 2.0)];
  let placement = Placement {
    offset_x: 0.0,
    offset_y: 0.0,
    quarter_turns: 1,
  };
  let out = generate(
    &project,
    &GcodeRequest {
      placement,
      ..request()
    },
  )
  .expect("generates");
  let b = out.stats.bounds;
  // Clockwise: (x, y) -> (y, 10 - x) on a square board.
  assert!(
    (b.min_x - 0.95).abs() < 0.01 && (b.max_x - 2.05).abs() < 0.01,
    "{b:?}"
  );
  assert!(
    (b.min_y - 7.95).abs() < 0.01 && (b.max_y - 9.05).abs() < 0.01,
    "{b:?}"
  );
}

#[test]
fn errors_when_the_side_has_no_copper() {
  let p = project(LayerKind::TopCopper);
  assert_eq!(
    error(
      &p,
      &GcodeRequest {
        side: BoardSide::Bottom,
        ..request()
      }
    ),
    "No bottom copper layer in this project"
  );
  let p = project(LayerKind::BottomCopper);
  assert_eq!(error(&p, &request()), "No top copper layer in this project");
}

#[test]
fn errors_when_there_is_nothing_to_engrave() {
  let mut p = project(LayerKind::TopCopper);
  p.layers[0].primitives = vec![Primitive::Hole {
    at: [1.0, 1.0],
    diameter: 0.5,
  }];
  assert_eq!(error(&p, &request()), "Nothing to engrave");
}

#[test]
fn errors_on_invalid_parameters() {
  let p = project(LayerKind::TopCopper);
  let bad: Vec<GcodeRequest> = vec![
    GcodeRequest {
      power_percent: f64::NAN,
      ..request()
    },
    GcodeRequest {
      power_percent: -1.0,
      ..request()
    },
    GcodeRequest {
      power_percent: 100.5,
      ..request()
    },
    GcodeRequest {
      power_percent: 0.0,
      ..request()
    },
    GcodeRequest {
      power_percent: 0.01,
      spindle_max: 10.0,
      ..request()
    },
    GcodeRequest {
      feed_rate: 0.0,
      ..request()
    },
    GcodeRequest {
      feed_rate: f64::INFINITY,
      ..request()
    },
    GcodeRequest {
      spot_diameter: 0.0,
      ..request()
    },
    GcodeRequest {
      spot_diameter: -0.1,
      ..request()
    },
    GcodeRequest {
      isolation_passes: 0,
      ..request()
    },
    GcodeRequest {
      isolation_passes: 21,
      ..request()
    },
    GcodeRequest {
      pass_overlap: 0.95,
      ..request()
    },
    GcodeRequest {
      pass_overlap: -0.1,
      ..request()
    },
    GcodeRequest {
      spindle_max: 0.0,
      ..request()
    },
    GcodeRequest {
      rapid_rate: Some(0.0),
      ..request()
    },
    GcodeRequest {
      placement: Placement {
        offset_x: f64::NAN,
        offset_y: 0.0,
        quarter_turns: 0,
      },
      ..request()
    },
  ];
  for r in bad {
    assert!(generate(&p, &r).is_err(), "accepted {r:?}");
  }
  // The edges of the valid ranges are fine.
  for r in [
    GcodeRequest {
      power_percent: 100.0,
      ..request()
    },
    GcodeRequest {
      isolation_passes: 20,
      ..request()
    },
    GcodeRequest {
      pass_overlap: 0.9,
      ..request()
    },
    GcodeRequest {
      pass_overlap: 0.0,
      ..request()
    },
  ] {
    assert!(generate(&p, &r).is_ok(), "rejected {r:?}");
  }
}

#[test]
fn request_deserializes_from_the_ui_shape() {
  let json = r#"{
    "dialect": "grblHal",
    "side": "bottom",
    "placement": { "offsetX": 10, "offsetY": 20.5, "quarterTurns": 3 },
    "powerPercent": 65,
    "feedRate": 1200,
    "rapidRate": null
  }"#;
  let r: GcodeRequest = serde_json::from_str(json).expect("parses");
  assert_eq!(r.side, BoardSide::Bottom);
  assert_eq!(
    r.placement,
    Placement {
      offset_x: 10.0,
      offset_y: 20.5,
      quarter_turns: 3
    }
  );
  assert_eq!(r.rapid_rate, None);
  // Omitted values take their defaults.
  assert_eq!(
    (
      r.spot_diameter,
      r.isolation_passes,
      r.pass_overlap,
      r.spindle_max
    ),
    (0.1, 1, 0.3, 1000.0)
  );
}

#[test]
fn output_serializes_in_camel_case() {
  let json = serde_json::to_value(run(&request())).unwrap();
  assert!(json["stats"]["contourCount"].is_u64());
  assert!(json["stats"]["engraveLengthMm"].is_f64());
  assert!(json["stats"]["bounds"]["minX"].is_f64());
  assert!(json["lines"].is_array() && json["warnings"].is_array());
}
