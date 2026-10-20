//! End-to-end tests of `parse_project` with small synthetic fixtures.

use super::model::{BoardSource, FlashShape, LayerKind, ParsedLayer, ParsedProject, Primitive};
use super::{InputFile, parse_project};

fn file(name: &str, content: &str) -> InputFile {
  InputFile {
    name: name.into(),
    content: content.into(),
  }
}

/// Parses one top-copper file and returns its layer.
fn copper(content: &str) -> ParsedLayer {
  let project = parse_project(&[file("t-F_Cu.gbr", content)]);
  assert!(project.skipped.is_empty(), "skipped: {:?}", project.skipped);
  project.layers.into_iter().next().expect("one layer")
}

fn skipped_reason(name: &str, content: &str) -> String {
  let project = parse_project(&[file(name, content)]);
  assert!(project.layers.is_empty());
  project.skipped[0].reason.clone()
}

const HEAD: &str = "%FSLAX24Y24*%\n%MOMM*%\n%LPD*%\n";

fn gerber(body: &str) -> String {
  format!("{HEAD}{body}\nM02*\n")
}

fn close(a: f64, b: f64) -> bool {
  (a - b).abs() < 1e-6
}

#[test]
fn draws_use_aperture_width_and_mm() {
  let layer = copper(&gerber(
    "%ADD10C,0.2*%\nD10*\nX10000Y20000D02*\nX30000Y20000D01*\nY40000D01*",
  ));
  assert_eq!(layer.primitive_count, 2);
  assert_eq!(
    layer.primitives[0],
    Primitive::Draw {
      from: [1.0, 2.0],
      to: [3.0, 2.0],
      width: 0.2
    }
  );
  // Y-only block keeps X modal.
  assert_eq!(
    layer.primitives[1],
    Primitive::Draw {
      from: [3.0, 2.0],
      to: [3.0, 4.0],
      width: 0.2
    }
  );
  // Bounds include half the stroke width.
  assert!(close(layer.bounds.min_x, 0.9) && close(layer.bounds.max_y, 4.1));
  assert_eq!(layer.label, "Top copper");
  assert_eq!(layer.id, "t-F_Cu.gbr");
}

#[test]
fn flashes_of_each_aperture_shape() {
  let layer = copper(&gerber(
    "%ADD10C,1.5*%\n%ADD11R,2X1*%\n%ADD12O,3X1*%\n%ADD13P,2X6X30*%\n\
     D10*\nX10000Y10000D03*\nD11*\nX20000Y10000D03*\nD12*\nX30000Y10000D03*\nD13*\nX40000Y10000D03*",
  ));
  let shapes: Vec<_> = layer
    .primitives
    .iter()
    .map(|p| match p {
      Primitive::Flash { at, shape } => (*at, shape.clone()),
      other => panic!("unexpected {other:?}"),
    })
    .collect();
  assert_eq!(
    shapes[0],
    ([1.0, 1.0], FlashShape::Circle { diameter: 1.5 })
  );
  assert_eq!(
    shapes[1],
    (
      [2.0, 1.0],
      FlashShape::Rect {
        width: 2.0,
        height: 1.0,
        rotation: 0.0
      }
    )
  );
  assert_eq!(
    shapes[2],
    (
      [3.0, 1.0],
      FlashShape::Obround {
        width: 3.0,
        height: 1.0,
        rotation: 0.0
      }
    )
  );
  let FlashShape::Polygon { points } = &shapes[3].1 else {
    panic!("polygon expected")
  };
  assert_eq!(points.len(), 6);
  // First vertex at 30 degrees on a radius of 1.
  assert!(close(points[0][0], 30f64.to_radians().cos()) && close(points[0][1], 0.5));
}

#[test]
fn region_becomes_one_closed_polygon() {
  let layer = copper(&gerber(
    "G36*\nX0Y0D02*\nG01*\nX20000Y0D01*\nX20000Y10000D01*\nX0Y10000D01*\nX0Y0D01*\nG37*",
  ));
  assert_eq!(layer.primitive_count, 1);
  let Primitive::Region { points } = &layer.primitives[0] else {
    panic!("region expected")
  };
  assert_eq!(
    points,
    &vec![[0.0, 0.0], [2.0, 0.0], [2.0, 1.0], [0.0, 1.0]]
  );
}

#[test]
fn multi_quadrant_arc_is_flattened_within_chord_error() {
  // Quarter circle of radius 5 mm, counter-clockwise, centre at the origin.
  let layer = copper(&gerber(
    "%ADD10C,0.1*%\nD10*\nG75*\nX50000Y0D02*\nG03*\nX0Y50000I-50000J0D01*",
  ));
  assert!(layer.primitive_count > 4);
  let mut prev = [5.0, 0.0];
  for p in &layer.primitives {
    let Primitive::Draw { from, to, .. } = p else {
      panic!("draw expected")
    };
    assert_eq!(*from, prev);
    prev = *to;
    assert!(
      close(to[0].hypot(to[1]), 5.0),
      "point off the circle: {to:?}"
    );
    let mid = [(from[0] + to[0]) / 2.0, (from[1] + to[1]) / 2.0];
    assert!(
      5.0 - mid[0].hypot(mid[1]) <= 0.005 + 1e-6,
      "chord error too large"
    );
  }
  assert_eq!(prev, [0.0, 5.0]);
}

#[test]
fn clockwise_and_full_circle_arcs() {
  let layer = copper(&gerber(
    "%ADD10C,0.1*%\nD10*\nX20000Y0D02*\nG02*\nX20000Y0I-20000J0D01*",
  ));
  // Full circle of radius 2, all points on it.
  assert!(layer.primitive_count > 8);
  for p in &layer.primitives {
    let Primitive::Draw { to, .. } = p else {
      panic!()
    };
    assert!(close(to[0].hypot(to[1]), 2.0));
  }
  let cw = copper(&gerber(
    "%ADD10C,0.1*%\nD10*\nG75*\nX10000Y0D02*\nG02*\nX0Y-10000I-10000J0D01*",
  ));
  let Primitive::Draw { to, .. } = cw.primitives.first().unwrap() else {
    panic!()
  };
  assert!(to[1] < 0.0, "clockwise from +X must go towards -Y");
}

#[test]
fn single_quadrant_arc_picks_the_matching_centre() {
  // G74 with unsigned offsets: quarter circle from (1,0) to (0,1), centre (0,0).
  let layer = copper(&gerber(
    "%ADD10C,0.1*%\nD10*\nG74*\nX10000Y0D02*\nG03*\nX0Y10000I10000J0D01*",
  ));
  for p in &layer.primitives {
    let Primitive::Draw { to, .. } = p else {
      panic!()
    };
    assert!(close(to[0].hypot(to[1]), 1.0), "{to:?}");
  }
}

#[test]
fn huge_arcs_do_not_explode() {
  // Radius of 99 m in a 3.3 format; segmentation is capped.
  let layer = copper(&gerber(
    "%FSLAX33Y33*%\n%ADD10C,0.1*%\nD10*\nX99000000Y0D02*\nG02*\nX99000000Y0I-99000000J0D01*",
  ));
  assert!(layer.primitive_count <= 20_001);
}

#[test]
fn inch_units_are_converted() {
  let layer = copper(
    "%FSLAX24Y24*%\n%MOIN*%\n%ADD10C,0.01*%\nD10*\nX10000Y20000D02*\nX20000Y20000D01*\nM02*",
  );
  assert_eq!(
    layer.primitives[0],
    Primitive::Draw {
      from: [25.4, 50.8],
      to: [50.8, 50.8],
      width: 0.254
    }
  );
}

#[test]
fn leading_zero_omission_in_coordinates() {
  // FSLA 2.3: "X1500" is 1.500 mm, "X5" is 0.005 mm.
  let layer = copper("%FSLAX23Y23*%\n%MOMM*%\n%ADD10C,0.1*%\nD10*\nX5Y0D02*\nX1500Y0D01*\nM02*");
  assert_eq!(
    layer.primitives[0],
    Primitive::Draw {
      from: [0.005, 0.0],
      to: [1.5, 0.0],
      width: 0.1
    }
  );
}

#[test]
fn trailing_zero_omission_in_coordinates() {
  // FSTA 2.3: "X15" is 15.000 mm (the digits are padded on the right).
  let layer = copper("%FSTAX23Y23*%\n%MOMM*%\n%ADD10C,0.1*%\nD10*\nX0Y0D02*\nX15Y02D01*\nM02*");
  assert_eq!(
    layer.primitives[0],
    Primitive::Draw {
      from: [0.0, 0.0],
      to: [15.0, 2.0],
      width: 0.1
    }
  );
}

#[test]
fn macro_aperture_becomes_polygon_flashes() {
  let layer = copper(&gerber(
    "%AMBOX*\n0 comment*\n$3=$1x2*\n21,1,$3,$2,0,0,0*%\n%ADD10BOX,1.5X1*%\nD10*\nX10000Y10000D03*",
  ));
  assert!(layer.warnings.is_empty());
  let Primitive::Flash {
    at,
    shape: FlashShape::Polygon { points },
  } = &layer.primitives[0]
  else {
    panic!("polygon flash expected")
  };
  assert_eq!(*at, [1.0, 1.0]);
  // $3 = 3.0 wide, $2 = 1.0 high, centred on the aperture origin.
  assert_eq!(points.len(), 4);
  assert!(close(points[2][0], 1.5) && close(points[2][1], 0.5));
}

#[test]
fn unsupported_macro_primitive_warns_but_loads() {
  let layer = copper(&gerber(
    "%AMMOIRE*\n6,0,0,5,0.1,0.1,2,0.1,6,0*\n1,1,1,0,0*%\n%ADD10MOIRE*%\nD10*\nX0Y0D03*",
  ));
  assert_eq!(layer.primitive_count, 1);
  assert_eq!(layer.warnings.len(), 1);
  assert!(layer.warnings[0].contains("primitive 6"));
}

#[test]
fn clear_polarity_is_ignored_with_one_warning() {
  let layer = copper(&gerber(
    "%ADD10C,1*%\nD10*\nX0Y0D03*\n%LPC*%\nX10000Y0D03*\nX20000Y0D03*\n%LPD*%\nX30000Y0D03*",
  ));
  assert_eq!(layer.primitive_count, 2);
  assert_eq!(
    layer
      .warnings
      .iter()
      .filter(|w| w.contains("Clear polarity"))
      .count(),
    1
  );
}

#[test]
fn broken_files_are_skipped_not_fatal() {
  let reason = skipped_reason("x-F_Cu.gbr", "this is not a gerber file");
  assert!(reason.starts_with("Could not parse:"), "{reason}");
  let reason = skipped_reason("x-F_Cu.gbr", &gerber("D10*\nX0Y0D03*"));
  assert!(
    reason.starts_with("Could not parse:") && reason.contains("D10"),
    "{reason}"
  );
  let reason = skipped_reason(
    "x-F_Cu.gbr",
    &gerber("%ADD10C,1*%\nD10*\nX9999999999999Y0D03*"),
  );
  assert!(reason.starts_with("Could not parse:"), "{reason}");
  let reason = skipped_reason("x-F_Cu.gbr", "%ADD10C,1*%\nX0Y0D03*");
  assert!(reason.starts_with("Could not parse:"), "{reason}");
  let reason = skipped_reason("x-F_Cu.gbr", &gerber("%ADD10C,1e9*%"));
  assert!(reason.starts_with("Could not parse:"), "{reason}");
}

#[test]
fn good_and_broken_files_coexist() {
  let files = [
    file("p-F_Cu.gbr", &gerber("%ADD10C,1*%\nD10*\nX0Y0D03*")),
    file("p-B_Cu.gbr", "garbage"),
  ];
  let project = parse_project(&files);
  assert_eq!(project.layers.len(), 1);
  assert_eq!(project.skipped.len(), 1);
  assert_eq!(project.skipped[0].file_name, "p-B_Cu.gbr");
}

#[test]
fn drill_with_metric_decimal_coordinates() {
  let drl = "M48\nFMAT,2\nMETRIC\nT1C0.800\nT2C1.000\n%\nG90\nG05\nT1\nX67.0Y-71.75\nT2\nX10.5Y3.0\nY4.25\nM30\n";
  let project = parse_project(&[file("p-PTH.drl", drl)]);
  let layer = &project.layers[0];
  assert_eq!(layer.kind, LayerKind::Drill);
  assert_eq!(layer.label, "Drill");
  assert_eq!(
    layer.primitives,
    vec![
      Primitive::Hole {
        at: [67.0, -71.75],
        diameter: 0.8
      },
      Primitive::Hole {
        at: [10.5, 3.0],
        diameter: 1.0
      },
      Primitive::Hole {
        at: [10.5, 4.25],
        diameter: 1.0
      },
    ]
  );
  assert!(close(layer.bounds.min_y, -72.15));
}

#[test]
fn drill_fixed_width_inch_with_zero_suppression() {
  // INCH 2.4: with TZ the leading zeros are omitted, so 5000 = 0.5 inch.
  let tz = "M48\nINCH,TZ\nT1C0.05\n%\nT1\nX5000Y-10000\nM30\n";
  let layer = parse_project(&[file("a.drl", tz)]).layers.remove(0);
  assert_eq!(
    layer.primitives[0],
    Primitive::Hole {
      at: [12.7, -25.4],
      diameter: 1.27
    }
  );
  // With LZ the trailing zeros are omitted: "0125" -> 012500 -> 1.25 inch.
  let lz = "M48\nINCH,LZ\nT1C0.05\n%\nT1\nX0125Y0075\nM30\n";
  let layer = parse_project(&[file("a.drl", lz)]).layers.remove(0);
  assert_eq!(
    layer.primitives[0],
    Primitive::Hole {
      at: [31.75, 19.05],
      diameter: 1.27
    }
  );
}

#[test]
fn empty_drill_file_is_omitted_entirely() {
  let drl = "M48\n; #@! TF.FileFunction,NonPlated,1,2,NPTH\nFMAT,2\nMETRIC\n%\nG90\nG05\nM30\n";
  let project = parse_project(&[file("p-NPTH.drl", drl)]);
  assert!(project.layers.is_empty());
  assert!(project.skipped.is_empty());
  assert!(project.board.is_none());
}

#[test]
fn drill_routing_is_ignored_with_a_warning() {
  let drl = "M48\nMETRIC\nT1C1.0\n%\nG05\nT1\nX1.0Y1.0\nG00X5.0Y5.0\nM15\nG01X8.0Y5.0\nM16\nG05\nX2.0Y2.0\nM30\n";
  let layer = parse_project(&[file("a.drl", drl)]).layers.remove(0);
  assert_eq!(layer.primitive_count, 2);
  assert_eq!(layer.warnings.len(), 1);
}

#[test]
fn undefined_drill_tool_is_a_parse_error() {
  let reason = skipped_reason("a.drl", "M48\nMETRIC\n%\nT3\nX1.0Y1.0\nM30\n");
  assert!(reason.starts_with("Could not parse:"), "{reason}");
}

fn outline(x0: i64, y0: i64, x1: i64, y1: i64) -> String {
  gerber(&format!(
    "%ADD10C,0.1*%\nD10*\nX{x0}Y{y0}D02*\nX{x1}Y{y0}D01*\nX{x1}Y{y1}D01*\nX{x0}Y{y1}D01*\nX{x0}Y{y0}D01*"
  ))
}

#[test]
fn board_bounds_prefer_the_outline_centre_line() {
  let files = [
    file(
      "b-F_Cu.gbr",
      &gerber("%ADD10C,1*%\nD10*\nX0Y0D03*\nX500000Y200000D03*"),
    ),
    file("b-Edge_Cuts.gbr", &outline(100000, 50000, 530000, 305000)),
  ];
  let board: ProjectBoard = parse_project(&files).into();
  assert_eq!(board.source, BoardSource::Outline);
  assert!(
    close(board.width, 43.0) && close(board.height, 25.5),
    "{} x {}",
    board.width,
    board.height
  );
  assert!(close(board.min_x, 10.0) && close(board.min_y, 5.0));
}

#[test]
fn board_bounds_fall_back_to_copper() {
  let files = [
    file(
      "b-F_Cu.gbr",
      &gerber("%ADD10C,1*%\nD10*\nX0Y0D03*\nX100000Y50000D03*"),
    ),
    file("b-B_Cu.gbr", &gerber("%ADD10R,2X2*%\nD10*\nX200000Y0D03*")),
  ];
  let board: ProjectBoard = parse_project(&files).into();
  assert_eq!(board.source, BoardSource::Copper);
  // Includes aperture sizes: x from -0.5 to 21.0, y from -1.0 to 5.5.
  assert!(
    close(board.width, 21.5) && close(board.height, 6.5),
    "{} x {}",
    board.width,
    board.height
  );
}

struct ProjectBoard {
  source: BoardSource,
  width: f64,
  height: f64,
  min_x: f64,
  min_y: f64,
}

impl From<ParsedProject> for ProjectBoard {
  fn from(p: ParsedProject) -> Self {
    let b = p.board.expect("board");
    ProjectBoard {
      source: b.source,
      width: b.width,
      height: b.height,
      min_x: b.bounds.min_x,
      min_y: b.bounds.min_y,
    }
  }
}

#[test]
fn classification_by_x2_attribute_and_by_name() {
  let body = "%ADD10C,1*%\nD10*\nX0Y0D03*";
  let x2 = |function: &str| format!("%TF.FileFunction,{function}*%\n{}", gerber(body));
  let files = [
    file("one.gbr", &x2("Copper,L1,Top")),
    file("two.gbr", &x2("Copper,L4,Bot")),
    file("three.gbr", &x2("Profile,NP")),
    file("proj.gtl", &gerber(body)),
    file("proj.gbl", &gerber(body)),
    file("proj.gko", &gerber(body)),
  ];
  let kinds: Vec<_> = parse_project(&files)
    .layers
    .iter()
    .map(|l| l.kind)
    .collect();
  use LayerKind::*;
  assert_eq!(
    kinds,
    [
      TopCopper,
      TopCopper,
      BottomCopper,
      BottomCopper,
      Outline,
      Outline
    ]
  );
}

#[test]
fn unsupported_layers_are_skipped_with_reasons() {
  let body = gerber("%ADD10C,1*%\nD10*\nX0Y0D03*");
  let files = [
    file("p-F_Mask.gbr", &body),
    file("p-B_Silkscreen.gbr", &body),
    file("p-In1_Cu.gbr", &body),
    file("p-F_Paste.gbr", &body),
    file("p-job.gbrjob", "{}"),
    file("p-F_Cu.gbr", &body),
  ];
  let project = parse_project(&files);
  assert_eq!(project.layers.len(), 1);
  let reasons: Vec<_> = project
    .skipped
    .iter()
    .map(|s| (s.file_name.as_str(), s.reason.as_str()))
    .collect();
  assert_eq!(
    reasons,
    [
      ("p-F_Mask.gbr", "Solder mask is not used for engraving"),
      ("p-B_Silkscreen.gbr", "Silkscreen is not used for engraving"),
      ("p-In1_Cu.gbr", "Inner copper is not supported"),
      ("p-F_Paste.gbr", "Solder paste is not used for engraving"),
      ("p-job.gbrjob", "Not a Gerber or drill file"),
    ]
  );
}

#[test]
fn layers_are_sorted_by_kind() {
  let body = gerber("%ADD10C,1*%\nD10*\nX0Y0D03*");
  let drl = "M48\nMETRIC\nT1C1\n%\nT1\nX1Y1\nM30\n";
  let files = [
    file("p.drl", drl),
    file("p-Edge_Cuts.gbr", &body),
    file("p-B_Cu.gbr", &body),
    file("p-F_Cu.gbr", &body),
  ];
  let kinds: Vec<_> = parse_project(&files)
    .layers
    .iter()
    .map(|l| l.kind)
    .collect();
  use LayerKind::*;
  assert_eq!(kinds, [TopCopper, BottomCopper, Outline, Drill]);
}

#[test]
fn project_name_derivation() {
  let g = gerber("%ADD10C,1*%\nD10*\nX0Y0D03*");
  let name = |files: &[InputFile]| parse_project(files).name;
  assert_eq!(
    name(&[
      file("Laser-test-pcb-F_Cu.gbr", &g),
      file("Laser-test-pcb-B_Cu.gbr", &g)
    ]),
    "Laser-test-pcb"
  );
  assert_eq!(
    name(&[file("board_top.gtl", &g), file("board_bottom.gbl", &g)]),
    "board"
  );
  // No shared prefix: fall back to the X2 project id.
  let with_id = format!("G04 #@! TF.ProjectId,My Board,4c61,rev1*\n{g}");
  assert_eq!(
    name(&[file("F_Cu.gbr", &with_id), file("B_Cu.gbr", &g)]),
    "My Board"
  );
  // A single file or nothing else: the first file name.
  assert_eq!(name(&[file("F_Cu.gbr", &g)]), "F_Cu.gbr");
  assert_eq!(name(&[file("a.gtl", &g), file("z.gbl", &g)]), "a.gtl");
}

#[test]
fn serialises_to_the_contract_json_shape() {
  let project = parse_project(&[file(
    "a-F_Cu.gbr",
    &gerber(
      "%ADD10C,1*%\n%ADD11R,2X1*%\nD10*\nX0Y0D02*\nX10000Y0D01*\nD11*\nX0Y0D03*\nG36*\nX0Y0D02*\nX10000Y0D01*\nY10000D01*\nG37*",
    ),
  )]);
  let json = serde_json::to_value(&project).unwrap();
  let layer = &json["layers"][0];
  assert_eq!(layer["kind"], "topCopper");
  assert_eq!(layer["fileName"], "a-F_Cu.gbr");
  assert_eq!(layer["primitiveCount"], 3);
  assert_eq!(layer["primitives"][0]["type"], "draw");
  assert_eq!(
    layer["primitives"][0]["from"],
    serde_json::json!([0.0, 0.0])
  );
  assert_eq!(layer["primitives"][1]["type"], "flash");
  assert_eq!(layer["primitives"][1]["shape"]["kind"], "rect");
  assert_eq!(layer["primitives"][2]["type"], "region");
  assert_eq!(layer["bounds"]["minX"], -1.0);
  assert_eq!(json["board"]["source"], "copper");
  assert!(json["skipped"].as_array().unwrap().is_empty());
}
