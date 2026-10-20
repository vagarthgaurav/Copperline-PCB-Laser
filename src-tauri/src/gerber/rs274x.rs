//! RS-274X (Gerber) parser producing flattened millimetre geometry.

use super::geometry::{
  arc_points, arc_sweep, regular_polygon, round_point, round6, within_quadrant,
};
use super::macros::{self, MacroDef};
use super::model::{FlashShape, Geometry, MAX_COORD_MM, MAX_PRIMITIVES, Point, Primitive};
use std::collections::HashMap;

const MM_PER_INCH: f64 = 25.4;

pub fn parse(content: &str) -> Result<Geometry, String> {
  let mut parser = Parser::new();
  parser.run(content)?;
  parser.finish()
}

#[derive(Debug, Clone, Copy)]
struct Format {
  decimals: u32,
  total: usize,
  leading_omitted: bool,
}

#[derive(Debug, Clone)]
struct Aperture {
  shapes: Vec<FlashShape>,
  /// Stroke width when used with D01.
  draw_width: f64,
  /// False when drawing with it is only an approximation.
  circular: bool,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Interp {
  Linear,
  Cw,
  Ccw,
}

#[derive(Debug, Default)]
struct Region {
  contours: Vec<Vec<Point>>,
  current: Vec<Point>,
}

struct Parser {
  format: Option<Format>,
  unit_scale: f64,
  units_set: bool,
  apertures: HashMap<u32, Aperture>,
  macros: HashMap<String, MacroDef>,
  current_aperture: Option<u32>,
  pos: Point,
  interp: Interp,
  multi_quadrant: bool,
  last_op: Option<u32>,
  dark: bool,
  clear_ignored: bool,
  region: Option<Region>,
  in_aperture_block: bool,
  done: bool,
  geometry: Geometry,
}

impl Parser {
  fn new() -> Self {
    Parser {
      format: None,
      unit_scale: 1.0,
      units_set: false,
      apertures: HashMap::new(),
      macros: HashMap::new(),
      current_aperture: None,
      pos: [0.0, 0.0],
      interp: Interp::Linear,
      multi_quadrant: true,
      last_op: None,
      dark: true,
      clear_ignored: false,
      region: None,
      in_aperture_block: false,
      done: false,
      geometry: Geometry::default(),
    }
  }

  fn warn(&mut self, msg: impl Into<String>) {
    let msg = msg.into();
    if !self.geometry.warnings.contains(&msg) {
      self.geometry.warnings.push(msg);
    }
  }

  fn run(&mut self, content: &str) -> Result<(), String> {
    let mut rest = content.trim_start_matches('\u{feff}');
    while !self.done {
      rest = rest.trim_start();
      if rest.is_empty() {
        break;
      }
      if let Some(r) = rest.strip_prefix('%') {
        let end = r.find('%').ok_or("unterminated extended command")?;
        self.extended(&r[..end])?;
        rest = &r[end + 1..];
      } else {
        let end = rest.find('*').unwrap_or(rest.len());
        let block = &rest[..end];
        rest = rest.get(end + 1..).unwrap_or("");
        self.block(block)?;
      }
    }
    Ok(())
  }

  fn finish(mut self) -> Result<Geometry, String> {
    if self.format.is_none() {
      return Err("missing format specification (%FS)".into());
    }
    if self.region.is_some() {
      self.end_region();
    }
    if !self.units_set {
      self.warn("Units were not specified, assuming millimetres");
    }
    if self.clear_ignored {
      self.warn("Clear polarity (LPC) is not supported; clear geometry was ignored");
    }
    Ok(self.geometry)
  }

  // ---- extended commands (%...%) ----

  fn extended(&mut self, body: &str) -> Result<(), String> {
    let blocks: Vec<&str> = body
      .split('*')
      .map(str::trim)
      .filter(|b| !b.is_empty())
      .collect();
    let Some(first) = blocks.first() else {
      return Ok(());
    };
    if let Some(name) = first.strip_prefix("AM") {
      let def = MacroDef::from_blocks(blocks[1..].iter().copied());
      self.macros.insert(name.trim().to_string(), def);
      return Ok(());
    }
    for b in blocks {
      let b: String = b.chars().filter(|c| !c.is_whitespace()).collect();
      self.extended_block(&b)?;
    }
    Ok(())
  }

  fn extended_block(&mut self, b: &str) -> Result<(), String> {
    let Some(code) = b.get(..2) else {
      return Ok(());
    };
    let args = &b[2..];
    match code {
      "FS" => self.format_spec(args)?,
      "MO" => match args {
        "MM" => {
          self.unit_scale = 1.0;
          self.units_set = true;
        }
        "IN" => {
          self.unit_scale = MM_PER_INCH;
          self.units_set = true;
        }
        _ => return Err(format!("unknown unit '{args}'")),
      },
      "AD" => self.aperture_definition(args)?,
      "LP" => match args {
        "D" => self.dark = true,
        "C" => self.dark = false,
        _ => return Err(format!("unknown polarity '{args}'")),
      },
      "LM" if args != "N" => self.warn("Aperture mirroring (LM) is not supported and was ignored"),
      "LR" if args.parse::<f64>().is_ok_and(|v| v != 0.0) => {
        self.warn("Aperture rotation (LR) is not supported and was ignored")
      }
      "LS" if args.parse::<f64>().is_ok_and(|v| v != 1.0) => {
        self.warn("Aperture scaling (LS) is not supported and was ignored")
      }
      "SR" => {
        let repeated = args.contains("X") && !args.starts_with("X1Y1");
        if repeated {
          self.warn("Step and repeat (SR) is not supported; only the first copy is used");
        }
      }
      "AB" => {
        self.warn("Aperture blocks (AB) are not supported and were skipped");
        if args.is_empty() {
          self.in_aperture_block = false;
        } else {
          self.in_aperture_block = true;
          if let Some(n) = args.strip_prefix('D').and_then(|d| d.parse::<u32>().ok()) {
            self.apertures.insert(
              n,
              Aperture {
                shapes: vec![],
                draw_width: 0.0,
                circular: false,
              },
            );
          }
        }
      }
      "MI" | "SF" | "IR" | "AS" => self.warn(format!(
        "Deprecated command {code} is not supported and was ignored"
      )),
      _ => {} // TF, TA, TD, TO, IN, LN, IP, OF and unknown commands
    }
    Ok(())
  }

  fn format_spec(&mut self, args: &str) -> Result<(), String> {
    let bytes = args.as_bytes();
    let bad = || format!("invalid format specification 'FS{args}'");
    if bytes.len() < 8 {
      return Err(bad());
    }
    let leading_omitted = match bytes[0] {
      b'L' | b'D' => true,
      b'T' => false,
      _ => return Err(bad()),
    };
    match bytes[1] {
      b'A' => {}
      b'I' => return Err("incremental coordinates are not supported".into()),
      _ => return Err(bad()),
    }
    let digit = |i: usize| (bytes[i] as char).to_digit(10).ok_or_else(bad);
    if bytes[2] != b'X' || bytes[5] != b'Y' {
      return Err(bad());
    }
    let (int, dec) = (digit(3)?, digit(4)?);
    if int + dec == 0 || int > 8 || dec > 8 {
      return Err(bad());
    }
    self.format = Some(Format {
      decimals: dec,
      total: (int + dec) as usize,
      leading_omitted,
    });
    Ok(())
  }

  fn aperture_definition(&mut self, args: &str) -> Result<(), String> {
    let rest = args
      .strip_prefix('D')
      .ok_or("invalid aperture definition")?;
    let digits = rest.bytes().take_while(u8::is_ascii_digit).count();
    let code: u32 = rest[..digits]
      .parse()
      .map_err(|_| "invalid aperture number")?;
    let (template, params) = rest[digits..]
      .split_once(',')
      .unwrap_or((&rest[digits..], ""));
    let nums = params
      .split('X')
      .filter(|p| !p.is_empty())
      .map(|p| {
        p.parse::<f64>()
          .map_err(|_| format!("invalid aperture parameter '{p}'"))
      })
      .collect::<Result<Vec<f64>, _>>()?;
    if nums
      .iter()
      .any(|v| !v.is_finite() || v.abs() * self.unit_scale > MAX_COORD_MM)
    {
      return Err(format!("aperture D{code} has an out-of-range parameter"));
    }
    let s = self.unit_scale;
    let need = |n: usize| {
      if nums.len() >= n {
        Ok(())
      } else {
        Err(format!("aperture D{code} has too few parameters"))
      }
    };
    let aperture = match template {
      "C" => {
        need(1)?;
        let d = nums[0].abs() * s;
        Aperture {
          shapes: vec![FlashShape::Circle { diameter: d }],
          draw_width: d,
          circular: true,
        }
      }
      "R" | "O" => {
        need(2)?;
        let (w, h) = (nums[0].abs() * s, nums[1].abs() * s);
        let shape = if template == "R" {
          FlashShape::Rect {
            width: w,
            height: h,
            rotation: 0.0,
          }
        } else {
          FlashShape::Obround {
            width: w,
            height: h,
            rotation: 0.0,
          }
        };
        Aperture {
          shapes: vec![shape],
          draw_width: w.min(h),
          circular: false,
        }
      }
      "P" => {
        need(2)?;
        let vertices = (nums[1].max(3.0) as usize).min(1_000);
        let rot = nums.get(2).copied().unwrap_or(0.0);
        let points = regular_polygon([0.0, 0.0], nums[0].abs() * s, vertices, rot);
        Aperture {
          shapes: vec![FlashShape::Polygon { points }],
          draw_width: nums[0].abs() * s,
          circular: false,
        }
      }
      name => {
        let def = self
          .macros
          .get(name)
          .ok_or_else(|| format!("undefined aperture macro '{name}'"))?;
        let mut warnings = Vec::new();
        let shapes = macros::evaluate(def, &nums, s, &mut warnings)?;
        for w in warnings {
          self.warn(w);
        }
        Aperture {
          shapes,
          draw_width: 0.0,
          circular: false,
        }
      }
    };
    let mut aperture = aperture;
    aperture.shapes.iter_mut().for_each(round_shape);
    self.apertures.insert(code, aperture);
    Ok(())
  }

  // ---- ordinary blocks ----

  fn block(&mut self, raw: &str) -> Result<(), String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.starts_with("G04") {
      return Ok(());
    }
    let compact: String = trimmed.chars().filter(|c| !c.is_whitespace()).collect();
    let words = tokenize(&compact)?;

    let (mut x, mut y, mut i, mut j, mut d) = (None, None, None, None, None);
    let mut g_codes = Vec::new();
    for (letter, value) in &words {
      match letter {
        b'G' => g_codes.push(parse_code(value)?),
        b'D' => d = Some(parse_code(value)?),
        b'M' => {
          if matches!(parse_code(value)?, 0 | 2) {
            self.done = true;
          }
        }
        b'X' => x = Some(*value),
        b'Y' => y = Some(*value),
        b'I' => i = Some(*value),
        b'J' => j = Some(*value),
        _ => {} // N line numbers and anything else
      }
    }
    for g in g_codes {
      match g {
        1 => self.interp = Interp::Linear,
        2 => self.interp = Interp::Cw,
        3 => self.interp = Interp::Ccw,
        74 => self.multi_quadrant = false,
        75 => self.multi_quadrant = true,
        36 => {
          if self.region.is_none() {
            self.region = Some(Region::default());
          }
        }
        37 => self.end_region(),
        70 => {
          self.unit_scale = MM_PER_INCH;
          self.units_set = true;
        }
        71 => {
          self.unit_scale = 1.0;
          self.units_set = true;
        }
        91 => return Err("incremental coordinates are not supported".into()),
        _ => {}
      }
    }
    if let Some(code) = d.filter(|c| *c >= 10) {
      self.current_aperture = Some(code);
      return Ok(());
    }
    if x.is_none() && y.is_none() && d.is_none() {
      return Ok(());
    }
    let op = d.or(self.last_op);
    if d.is_some() {
      self.last_op = d;
    }
    let Some(op) = op else { return Ok(()) };
    let target = [
      x.map(|v| self.decode(v))
        .transpose()?
        .unwrap_or(self.pos[0]),
      y.map(|v| self.decode(v))
        .transpose()?
        .unwrap_or(self.pos[1]),
    ];
    let offset = [
      i.map(|v| self.decode(v)).transpose()?.unwrap_or(0.0),
      j.map(|v| self.decode(v)).transpose()?.unwrap_or(0.0),
    ];
    if !self.in_aperture_block {
      match op {
        1 => self.interpolate(target, offset)?,
        2 => self.move_to(),
        3 => self.flash(target)?,
        _ => {}
      }
    }
    self.pos = target;
    Ok(())
  }

  /// Converts a raw coordinate string to mm.
  fn decode(&self, text: &str) -> Result<f64, String> {
    let format = self
      .format
      .ok_or("coordinate data before the format specification (%FS)")?;
    let value = if text.contains('.') {
      text
        .parse::<f64>()
        .map_err(|_| format!("invalid coordinate '{text}'"))?
    } else {
      let (negative, digits) = match text.as_bytes().first() {
        Some(b'-') => (true, &text[1..]),
        Some(b'+') => (false, &text[1..]),
        _ => (false, text),
      };
      if digits.is_empty() || digits.len() > 18 || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return Err(format!("invalid coordinate '{text}'"));
      }
      let mut n: i64 = digits
        .parse()
        .map_err(|_| format!("invalid coordinate '{text}'"))?;
      if !format.leading_omitted {
        // Trailing zeros omitted: pad on the right to the full width.
        for _ in digits.len()..format.total {
          n = n.saturating_mul(10);
        }
      }
      let v = n as f64 / 10f64.powi(format.decimals as i32);
      if negative { -v } else { v }
    };
    let mm = value * self.unit_scale;
    if !mm.is_finite() || mm.abs() > MAX_COORD_MM {
      return Err(format!("coordinate '{text}' is out of range"));
    }
    Ok(mm)
  }

  fn push(&mut self, p: Primitive) -> Result<(), String> {
    if self.geometry.primitives.len() >= MAX_PRIMITIVES {
      return Err("too many primitives".into());
    }
    self.geometry.primitives.push(p);
    Ok(())
  }

  fn move_to(&mut self) {
    if self.region.is_some() {
      self.close_contour();
    }
  }

  fn flash(&mut self, at: Point) -> Result<(), String> {
    if self.region.is_some() {
      self.warn("Flash inside a region was ignored");
      return Ok(());
    }
    let ap = self.aperture()?.clone();
    if !self.dark {
      self.clear_ignored = true;
      return Ok(());
    }
    for shape in ap.shapes {
      self.push(Primitive::Flash {
        at: round_point(at),
        shape,
      })?;
    }
    Ok(())
  }

  fn aperture(&self) -> Result<&Aperture, String> {
    let code = self.current_aperture.ok_or("no aperture selected")?;
    self
      .apertures
      .get(&code)
      .ok_or_else(|| format!("aperture D{code} is not defined"))
  }

  fn interpolate(&mut self, target: Point, offset: Point) -> Result<(), String> {
    let start = self.pos;
    let points = match self.interp {
      Interp::Linear => vec![target],
      arc => self.arc(start, target, offset, arc == Interp::Ccw)?,
    };
    if let Some(region) = self.region.as_mut() {
      if region.current.is_empty() {
        region.current.push(start);
      }
      region.current.extend(points);
      return Ok(());
    }
    let (width, circular) = {
      let ap = self.aperture()?;
      (ap.draw_width, ap.circular)
    };
    if !circular {
      self.warn("Drawing with a non-circular aperture was approximated");
    }
    if !self.dark {
      self.clear_ignored = true;
      return Ok(());
    }
    let mut from = start;
    for to in points {
      self.push(Primitive::Draw {
        from: round_point(from),
        to: round_point(to),
        width: round6(width),
      })?;
      from = to;
    }
    Ok(())
  }

  /// Flattened arc from `start` to `end`, excluding `start`.
  fn arc(
    &mut self,
    start: Point,
    end: Point,
    offset: Point,
    ccw: bool,
  ) -> Result<Vec<Point>, String> {
    if self.multi_quadrant {
      let center = [start[0] + offset[0], start[1] + offset[1]];
      let radius = (start[0] - center[0]).hypot(start[1] - center[1]);
      if radius > MAX_COORD_MM {
        return Err("arc radius is out of range".into());
      }
      let sweep = arc_sweep(center, start, end, ccw, true);
      return Ok(arc_points(center, start, end, sweep));
    }
    // Single quadrant: offsets are unsigned, find the centre that fits.
    if (start[0] - end[0]).hypot(start[1] - end[1]) < 1e-9 {
      return Ok(vec![end]);
    }
    let mut best: Option<(f64, Point, f64)> = None;
    for (sx, sy) in [(1.0, 1.0), (1.0, -1.0), (-1.0, 1.0), (-1.0, -1.0)] {
      let center = [
        start[0] + sx * offset[0].abs(),
        start[1] + sy * offset[1].abs(),
      ];
      let mismatch = ((start[0] - center[0]).hypot(start[1] - center[1])
        - (end[0] - center[0]).hypot(end[1] - center[1]))
      .abs();
      let sweep = arc_sweep(center, start, end, ccw, false);
      if within_quadrant(sweep) && best.is_none_or(|(m, _, _)| mismatch < m) {
        best = Some((mismatch, center, sweep));
      }
    }
    match best {
      Some((_, center, sweep)) => Ok(arc_points(center, start, end, sweep)),
      None => {
        self.warn("An arc could not be resolved and was drawn as a straight line");
        Ok(vec![end])
      }
    }
  }

  // ---- regions ----

  fn close_contour(&mut self) {
    let Some(region) = self.region.as_mut() else {
      return;
    };
    let mut pts = std::mem::take(&mut region.current);
    if pts.len() > 1 && pts.first() == pts.last() {
      pts.pop();
    }
    if pts.len() >= 3 {
      region.contours.push(pts);
    }
  }

  fn end_region(&mut self) {
    self.close_contour();
    let Some(region) = self.region.take() else {
      return;
    };
    if !self.dark {
      if !region.contours.is_empty() {
        self.clear_ignored = true;
      }
      return;
    }
    for contour in region.contours {
      let points = contour.into_iter().map(round_point).collect();
      if self.push(Primitive::Region { points }).is_err() {
        break;
      }
    }
  }
}

fn round_shape(shape: &mut FlashShape) {
  match shape {
    FlashShape::Circle { diameter } => *diameter = round6(*diameter),
    FlashShape::Rect { width, height, .. } | FlashShape::Obround { width, height, .. } => {
      *width = round6(*width);
      *height = round6(*height);
    }
    FlashShape::Polygon { points } => points.iter_mut().for_each(|p| *p = round_point(*p)),
  }
}

fn parse_code(value: &str) -> Result<u32, String> {
  value.parse().map_err(|_| format!("invalid code '{value}'"))
}

/// Splits a block such as `G01X100Y-200D01` into letter/value pairs.
fn tokenize(block: &str) -> Result<Vec<(u8, &str)>, String> {
  let bytes = block.as_bytes();
  let mut words = Vec::new();
  let mut i = 0;
  while i < bytes.len() {
    let letter = bytes[i].to_ascii_uppercase();
    if !letter.is_ascii_alphabetic() {
      return Err(format!(
        "unexpected character '{}'",
        block[i..].chars().next().unwrap_or('?')
      ));
    }
    let start = i + 1;
    let mut end = start;
    while end < bytes.len() && matches!(bytes[end], b'0'..=b'9' | b'+' | b'-' | b'.') {
      end += 1;
    }
    words.push((letter, &block[start..end]));
    i = end;
  }
  Ok(words)
}
