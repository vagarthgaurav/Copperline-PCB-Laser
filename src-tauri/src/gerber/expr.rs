//! Arithmetic expressions used by aperture macros: numbers, `$n` variables,
//! `+ - x / ( )` and unary signs.

use std::collections::HashMap;

pub type Vars = HashMap<usize, f64>;

const MAX_DEPTH: usize = 32;

pub fn eval(src: &str, vars: &Vars) -> Result<f64, String> {
  let mut p = Parser {
    s: src.as_bytes(),
    pos: 0,
    vars,
    depth: 0,
  };
  let v = p.expr()?;
  if p.pos != p.s.len() {
    return Err(format!(
      "unexpected '{}' in expression '{src}'",
      p.s[p.pos] as char
    ));
  }
  if v.is_finite() {
    Ok(v)
  } else {
    Err(format!("expression '{src}' is not finite"))
  }
}

struct Parser<'a> {
  s: &'a [u8],
  pos: usize,
  vars: &'a Vars,
  depth: usize,
}

impl Parser<'_> {
  fn peek(&self) -> Option<u8> {
    self.s.get(self.pos).copied()
  }

  fn expr(&mut self) -> Result<f64, String> {
    let mut v = self.term()?;
    while let Some(c) = self.peek() {
      match c {
        b'+' => {
          self.pos += 1;
          v += self.term()?;
        }
        b'-' => {
          self.pos += 1;
          v -= self.term()?;
        }
        _ => break,
      }
    }
    Ok(v)
  }

  fn term(&mut self) -> Result<f64, String> {
    let mut v = self.factor()?;
    while let Some(c) = self.peek() {
      match c {
        b'x' | b'X' | b'*' => {
          self.pos += 1;
          v *= self.factor()?;
        }
        b'/' => {
          self.pos += 1;
          let d = self.factor()?;
          v = if d == 0.0 { 0.0 } else { v / d };
        }
        _ => break,
      }
    }
    Ok(v)
  }

  fn factor(&mut self) -> Result<f64, String> {
    match self.peek() {
      Some(b'+') => {
        self.pos += 1;
        self.factor()
      }
      Some(b'-') => {
        self.pos += 1;
        Ok(-self.factor()?)
      }
      Some(b'(') => {
        self.depth += 1;
        if self.depth > MAX_DEPTH {
          return Err("expression nested too deeply".into());
        }
        self.pos += 1;
        let v = self.expr()?;
        if self.peek() != Some(b')') {
          return Err("missing ')' in expression".into());
        }
        self.pos += 1;
        self.depth -= 1;
        Ok(v)
      }
      Some(b'$') => {
        self.pos += 1;
        let start = self.pos;
        while self.peek().is_some_and(|c| c.is_ascii_digit()) {
          self.pos += 1;
        }
        let n: usize = std::str::from_utf8(&self.s[start..self.pos])
          .ok()
          .and_then(|t| t.parse().ok())
          .ok_or("invalid variable in expression")?;
        Ok(self.vars.get(&n).copied().unwrap_or(0.0))
      }
      Some(c) if c.is_ascii_digit() || c == b'.' => {
        let start = self.pos;
        while self.peek().is_some_and(|c| c.is_ascii_digit() || c == b'.') {
          self.pos += 1;
        }
        std::str::from_utf8(&self.s[start..self.pos])
          .ok()
          .and_then(|t| t.parse().ok())
          .ok_or_else(|| "invalid number in expression".to_string())
      }
      _ => Err("unexpected token in expression".into()),
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn evaluates_arithmetic_and_variables() {
    let vars = Vars::from([(1, 0.5), (2, 4.0)]);
    assert_eq!(eval("$1+$1", &vars).unwrap(), 1.0);
    assert_eq!(eval("2x($2-1)/3", &vars).unwrap(), 2.0);
    assert_eq!(eval("-$1", &vars).unwrap(), -0.5);
    assert_eq!(eval("$9", &vars).unwrap(), 0.0);
    assert!(eval("1+", &vars).is_err());
    assert!(eval(&"(".repeat(100), &vars).is_err());
  }
}
