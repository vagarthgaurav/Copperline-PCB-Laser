//! G-code text. Dialect-specific lines are methods on `Dialect`; the move
//! sequence is shared. The output stays within what `src/app/core/gcode-path.ts`
//! reads: G0/G1 modal moves with X, Y, F and `;` comments.

use super::isolation::Contour;
use super::{Dialect, GcodeRequest};

impl Dialect {
  fn name(self) -> &'static str {
    match self {
      Dialect::GrblHal => "grblHAL",
    }
  }

  /// Units, absolute mode, plane, feed mode and beam off. grblHAL needs laser
  /// mode (`$32=1`) so that G0 turns the beam off.
  fn preamble(self) -> &'static [&'static str] {
    match self {
      Dialect::GrblHal => &["G21", "G90", "G17", "G94", "M5"],
    }
  }

  /// Arms the beam with dynamic power (it only fires during G1 moves).
  fn laser_on_command(self) -> &'static str {
    match self {
      Dialect::GrblHal => "M4 S0",
    }
  }

  fn postamble(self) -> &'static [&'static str] {
    match self {
      Dialect::GrblHal => &["M5", "M30"],
    }
  }

  /// A note shown in the header about machine setup the program relies on.
  fn setup_note(self) -> &'static str {
    match self {
      Dialect::GrblHal => "needs laser mode ($32=1) and $30 equal to the spindle maximum",
    }
  }
}

/// The S word for the requested power: `round(power / 100 * spindle_max)`.
pub fn spindle_value(request: &GcodeRequest) -> u32 {
  (request.power_percent / 100.0 * request.spindle_max).round() as u32
}

/// A number with at most 3 decimals, trailing zeros trimmed, never "-0".
pub fn num(v: f64) -> String {
  let text = format!("{v:.3}");
  let text = text.trim_end_matches('0').trim_end_matches('.');
  if text == "-0" || text.is_empty() {
    "0".into()
  } else {
    text.into()
  }
}

/// The whole program for ordered, closed contours (each already starting at
/// the vertex to cut first). `contours` must not be empty.
pub fn emit(contours: &[Contour], request: &GcodeRequest, project_name: &str) -> Vec<String> {
  let dialect = request.dialect;
  let spindle = spindle_value(request);
  let feed = num(request.feed_rate);
  let mut lines = vec![
    format!(
      "; Copperline isolation: {}, {} copper, {} {}, {} mm spot, {} overlap",
      comment_text(project_name),
      request.side.name(),
      request.isolation_passes,
      if request.isolation_passes == 1 {
        "pass"
      } else {
        "passes"
      },
      num(request.spot_diameter),
      num(request.pass_overlap),
    ),
    format!(
      "; dialect {}  power {} % -> S{}  feed {} mm/min",
      dialect.name(),
      num(request.power_percent),
      spindle,
      feed,
    ),
    format!("; {}", dialect.setup_note()),
  ];
  lines.extend(dialect.preamble().iter().map(|l| l.to_string()));

  // F and S are modal: they are written on the first cut and when they change.
  let mut last_feed: Option<String> = None;
  let mut last_spindle: Option<u32> = None;
  for (index, contour) in contours.iter().enumerate() {
    let start = contour[0];
    lines.push(format!("G0 X{} Y{}", num(start[0]), num(start[1])));
    if index == 0 {
      lines.push(dialect.laser_on_command().to_string());
    }
    // Back to the start closes the contour.
    for point in contour[1..].iter().chain(std::iter::once(&start)) {
      let mut line = format!("G1 X{} Y{}", num(point[0]), num(point[1]));
      if last_feed.as_deref() != Some(feed.as_str()) {
        line.push_str(&format!(" F{feed}"));
        last_feed = Some(feed.clone());
      }
      if last_spindle != Some(spindle) {
        line.push_str(&format!(" S{spindle}"));
        last_spindle = Some(spindle);
      }
      lines.push(line);
    }
  }
  lines.extend(dialect.postamble().iter().map(|l| l.to_string()));
  lines
}

/// Keeps free text on one line and clear of the `(` `)` comment syntax.
fn comment_text(text: &str) -> String {
  text
    .chars()
    .map(|c| {
      if c.is_control() || c == '(' || c == ')' {
        ' '
      } else {
        c
      }
    })
    .collect()
}
