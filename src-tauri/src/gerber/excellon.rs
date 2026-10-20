//! Excellon drill file parser. Produces `hole` primitives in mm.
//! Routing (G00-G03, M15/M16, G85 slots) is ignored with a warning.

use super::geometry::{round_point, round6};
use super::model::{Geometry, MAX_COORD_MM, MAX_PRIMITIVES, Primitive};
use std::collections::HashMap;

const MM_PER_INCH: f64 = 25.4;

pub fn parse(content: &str) -> Result<Geometry, String> {
  let mut state = State::new();
  for raw in content.trim_start_matches('\u{feff}').lines() {
    state.line(raw)?;
    if state.done {
      break;
    }
  }
  Ok(state.geometry)
}

struct State {
  metric: bool,
  /// `Some(true)` for `TZ` (leading zeros omitted), `Some(false)` for `LZ`.
  leading_omitted: Option<bool>,
  tools: HashMap<u32, f64>,
  tool: Option<u32>,
  pos: [f64; 2],
  routing: bool,
  done: bool,
  geometry: Geometry,
}

impl State {
  fn new() -> Self {
    State {
      metric: true,
      leading_omitted: None,
      tools: HashMap::new(),
      tool: None,
      pos: [0.0, 0.0],
      routing: false,
      done: false,
      geometry: Geometry::default(),
    }
  }

  fn warn(&mut self, msg: &str) {
    if !self.geometry.warnings.iter().any(|w| w == msg) {
      self.geometry.warnings.push(msg.to_string());
    }
  }

  fn scale(&self) -> f64 {
    if self.metric { 1.0 } else { MM_PER_INCH }
  }

  fn line(&mut self, raw: &str) -> Result<(), String> {
    let line = raw.trim();
    if line.is_empty() || line.starts_with(';') || line == "%" || line == "M48" {
      return Ok(());
    }
    let upper = line.to_ascii_uppercase();
    if upper.starts_with("METRIC") || upper.starts_with("INCH") {
      self.metric = upper.starts_with("METRIC");
      if upper.contains(",TZ") {
        self.leading_omitted = Some(true);
      } else if upper.contains(",LZ") {
        self.leading_omitted = Some(false);
      }
      return Ok(());
    }
    match upper.as_str() {
      "M71" => self.metric = true,
      "M72" => self.metric = false,
      "M30" | "M00" => self.done = true,
      "G05" => self.routing = false,
      "G90" => {}
      "G91" => return Err("incremental coordinates are not supported".into()),
      "M15" | "M16" | "G00" | "G01" | "G02" | "G03" => {
        self.routing = true;
        self.warn("Routing commands (slots) are not supported and were ignored");
      }
      _ => self.statement(&upper)?,
    }
    Ok(())
  }

  fn statement(&mut self, s: &str) -> Result<(), String> {
    if s.starts_with("FMAT") || s.starts_with("ICI") || s.starts_with("VER") || s.starts_with("M95")
    {
      return Ok(());
    }
    if let Some(rest) = s.strip_prefix('T') {
      return self.tool_command(rest);
    }
    if ["G00", "G01", "G02", "G03"]
      .iter()
      .any(|g| s.starts_with(g))
    {
      self.routing = true;
      self.warn("Routing commands (slots) are not supported and were ignored");
      return Ok(());
    }
    if s.starts_with('X') || s.starts_with('Y') {
      return self.coordinates(s);
    }
    Ok(())
  }

  /// `T1`, `T01`, `T1C0.8`, `T1C0.8F200S65`.
  fn tool_command(&mut self, rest: &str) -> Result<(), String> {
    let digits = rest.bytes().take_while(u8::is_ascii_digit).count();
    let number: u32 = rest[..digits]
      .parse()
      .map_err(|_| format!("invalid tool 'T{rest}'"))?;
    let tail = &rest[digits..];
    if let Some(diameter) = tail.strip_prefix('C') {
      let end = diameter
        .find(|c: char| !(c.is_ascii_digit() || c == '.'))
        .unwrap_or(diameter.len());
      let d: f64 = diameter[..end]
        .parse()
        .map_err(|_| format!("invalid tool diameter 'T{rest}'"))?;
      let mm = d * self.scale();
      if !mm.is_finite() || mm > MAX_COORD_MM {
        return Err(format!("tool T{number} has an out-of-range diameter"));
      }
      self.tools.insert(number, mm);
    } else if number == 0 {
      self.tool = None;
    } else {
      self.tool = Some(number);
    }
    Ok(())
  }

  fn coordinates(&mut self, s: &str) -> Result<(), String> {
    if s.contains("G85") || self.routing {
      self.routing = true;
      self.warn("Routing commands (slots) are not supported and were ignored");
      return Ok(());
    }
    if s.contains('R') {
      self.warn("Repeat commands (R) are not supported and were ignored");
    }
    let (mut x, mut y) = (None, None);
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
      let letter = bytes[i];
      let start = i + 1;
      let mut end = start;
      while end < bytes.len() && matches!(bytes[end], b'0'..=b'9' | b'+' | b'-' | b'.') {
        end += 1;
      }
      match letter {
        b'X' => x = Some(self.decode(&s[start..end])?),
        b'Y' => y = Some(self.decode(&s[start..end])?),
        b'G' | b'R' | b'F' | b'S' => {}
        _ => {
          return Err(format!(
            "unexpected character '{}' in drill file",
            letter as char
          ));
        }
      }
      i = end.max(start);
    }
    let target = [x.unwrap_or(self.pos[0]), y.unwrap_or(self.pos[1])];
    self.pos = target;
    if x.is_none() && y.is_none() {
      return Ok(());
    }
    let tool = self.tool.ok_or("drill hit before a tool was selected")?;
    let diameter = *self
      .tools
      .get(&tool)
      .ok_or_else(|| format!("tool T{tool} is not defined"))?;
    if diameter <= 0.0 {
      return Ok(());
    }
    if self.geometry.primitives.len() >= MAX_PRIMITIVES {
      return Err("too many holes".into());
    }
    self.geometry.primitives.push(Primitive::Hole {
      at: round_point(target),
      diameter: round6(diameter),
    });
    Ok(())
  }

  /// Decimal coordinates are taken as-is; others use a 3.3 (metric) or
  /// 2.4 (inch) fixed format, with `LZ` meaning trailing zeros are omitted.
  fn decode(&self, text: &str) -> Result<f64, String> {
    let bad = || format!("invalid coordinate '{text}'");
    let value = if text.contains('.') {
      text.parse::<f64>().map_err(|_| bad())?
    } else {
      let (negative, digits) = match text.as_bytes().first() {
        Some(b'-') => (true, &text[1..]),
        Some(b'+') => (false, &text[1..]),
        _ => (false, text),
      };
      if digits.is_empty() || digits.len() > 18 {
        return Err(bad());
      }
      let mut n: i64 = digits.parse().map_err(|_| bad())?;
      let decimals = if self.metric { 3 } else { 4 };
      if self.leading_omitted == Some(false) {
        for _ in digits.len()..6 {
          n = n.saturating_mul(10);
        }
      }
      let v = n as f64 / 10f64.powi(decimals);
      if negative { -v } else { v }
    };
    let mm = value * self.scale();
    if !mm.is_finite() || mm.abs() > MAX_COORD_MM {
      return Err(format!("coordinate '{text}' is out of range"));
    }
    Ok(mm)
  }
}
