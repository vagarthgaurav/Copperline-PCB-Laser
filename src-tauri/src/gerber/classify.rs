//! Decides what a file is: X2 `TF.FileFunction` first, then the file name.

use super::model::LayerKind;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
  Gerber,
  Excellon,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Classification {
  Layer(LayerKind, Format),
  Skip(String),
}

pub const NOT_A_FILE: &str = "Not a Gerber or drill file";
const MASK: &str = "Solder mask is not used for engraving";
const PASTE: &str = "Solder paste is not used for engraving";
const SILK: &str = "Silkscreen is not used for engraving";
const INNER: &str = "Inner copper is not supported";

/// Fields of a Gerber X2 file attribute (`TF.<name>,a,b,...`), found in an
/// extended command or in a `G04 #@!` / `; #@!` comment.
pub fn file_attribute(content: &str, name: &str) -> Option<Vec<String>> {
  let key = format!("TF.{name},");
  let start = content.find(&key)? + key.len();
  let rest = &content[start..];
  let end = rest.find(['*', '\n', '\r', '%']).unwrap_or(rest.len());
  Some(
    rest[..end]
      .split(',')
      .map(|f| f.trim().to_string())
      .collect(),
  )
}

/// An Excellon file starts with an `M48` header line.
pub fn is_excellon(content: &str) -> bool {
  content
    .lines()
    .take(40)
    .any(|l| l.trim().eq_ignore_ascii_case("M48"))
}

pub fn classify(name: &str, content: &str) -> Classification {
  let excellon = is_excellon(content);
  if let Some(function) = file_attribute(content, "FileFunction")
    && let Some(result) = by_function(&function, excellon)
  {
    return result;
  }
  by_name(name, excellon)
}

fn by_function(function: &[String], excellon: bool) -> Option<Classification> {
  use Classification::{Layer, Skip};
  let main = function.first()?.to_ascii_lowercase();
  Some(match main.as_str() {
    "copper" => match function.get(2)?.to_ascii_lowercase().as_str() {
      "top" => Layer(LayerKind::TopCopper, Format::Gerber),
      "bot" => Layer(LayerKind::BottomCopper, Format::Gerber),
      "inr" => Skip(INNER.into()),
      _ => return None,
    },
    "profile" => Layer(LayerKind::Outline, Format::Gerber),
    "plated" | "nonplated" => {
      if excellon {
        Layer(LayerKind::Drill, Format::Excellon)
      } else {
        Skip("Gerber-format drill files are not supported".into())
      }
    }
    "soldermask" => Skip(MASK.into()),
    "paste" => Skip(PASTE.into()),
    "legend" => Skip(SILK.into()),
    other => Skip(format!(
      "Layer function '{other}' is not used for engraving"
    )),
  })
}

fn by_name(name: &str, excellon: bool) -> Classification {
  use Classification::{Layer, Skip};
  let n = name.to_ascii_lowercase();
  let ext = n.rsplit_once('.').map(|(_, e)| e).unwrap_or("");
  let gerber = |kind| Layer(kind, Format::Gerber);

  if matches!(ext, "drl" | "xln" | "exc") || (ext == "txt" && excellon) {
    return Layer(LayerKind::Drill, Format::Excellon);
  }
  if n.contains("edge_cuts") || n.contains("edge.cuts") || matches!(ext, "gko" | "gm1" | "gml") {
    return gerber(LayerKind::Outline);
  }
  if n.contains("f_cu") || n.contains("-f.cu") || ext == "gtl" {
    return gerber(LayerKind::TopCopper);
  }
  if n.contains("b_cu") || n.contains("-b.cu") || ext == "gbl" {
    return gerber(LayerKind::BottomCopper);
  }
  if is_inner_copper(&n, ext) {
    return Skip(INNER.into());
  }
  if n.contains("mask") || matches!(ext, "gts" | "gbs") {
    return Skip(MASK.into());
  }
  if n.contains("silk") || n.contains("legend") || matches!(ext, "gto" | "gbo") {
    return Skip(SILK.into());
  }
  if n.contains("paste") || matches!(ext, "gtp" | "gbp") {
    return Skip(PASTE.into());
  }
  if matches!(ext, "gbr" | "ger" | "art" | "pho" | "gbx") {
    return Skip("Could not determine the layer type".into());
  }
  Skip(NOT_A_FILE.into())
}

/// `In1_Cu`, `-In2.Cu`, `.g1`, `.gp1` and friends.
fn is_inner_copper(name: &str, ext: &str) -> bool {
  let numbered =
    ext.len() == 2 && ext.starts_with('g') && ext[1..].chars().all(|c| c.is_ascii_digit());
  let plane =
    ext.len() == 3 && ext.starts_with("gp") && ext[2..].chars().all(|c| c.is_ascii_digit());
  if numbered || plane {
    return true;
  }
  name.match_indices("in").any(|(i, _)| {
    let rest = &name[i + 2..];
    let digits = rest.chars().take_while(char::is_ascii_digit).count();
    digits > 0 && (rest[digits..].starts_with("_cu") || rest[digits..].starts_with(".cu"))
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use Classification::{Layer, Skip};

  fn kind_of(name: &str, content: &str) -> Classification {
    classify(name, content)
  }

  #[test]
  fn x2_attribute_wins_over_file_name() {
    let top = "%TF.FileFunction,Copper,L1,Top*%\n";
    assert_eq!(
      kind_of("whatever.gbl", top),
      Layer(LayerKind::TopCopper, Format::Gerber)
    );
    let bottom = "G04 #@! TF.FileFunction,Copper,L2,Bot*\n";
    assert_eq!(
      kind_of("a.gtl", bottom),
      Layer(LayerKind::BottomCopper, Format::Gerber)
    );
    let profile = "%TF.FileFunction,Profile,NP*%";
    assert_eq!(
      kind_of("x.gbr", profile),
      Layer(LayerKind::Outline, Format::Gerber)
    );
    let drill = "M48\n; #@! TF.FileFunction,Plated,1,2,PTH\n";
    assert_eq!(
      kind_of("x.txt", drill),
      Layer(LayerKind::Drill, Format::Excellon)
    );
  }

  #[test]
  fn x2_skips_mask_paste_legend_and_inner_copper() {
    let case = |f: &str| kind_of("a.gbr", &format!("%TF.FileFunction,{f}*%"));
    assert_eq!(case("Soldermask,Top"), Skip(MASK.into()));
    assert_eq!(case("Paste,Bot"), Skip(PASTE.into()));
    assert_eq!(case("Legend,Top"), Skip(SILK.into()));
    assert_eq!(case("Copper,L2,Inr"), Skip(INNER.into()));
  }

  #[test]
  fn classifies_by_file_name() {
    let name = |n: &str| kind_of(n, "");
    assert_eq!(
      name("Proj-F_Cu.gbr"),
      Layer(LayerKind::TopCopper, Format::Gerber)
    );
    assert_eq!(
      name("PROJ.GTL"),
      Layer(LayerKind::TopCopper, Format::Gerber)
    );
    assert_eq!(
      name("proj-F.Cu.gbr"),
      Layer(LayerKind::TopCopper, Format::Gerber)
    );
    assert_eq!(
      name("Proj-B_Cu.gbr"),
      Layer(LayerKind::BottomCopper, Format::Gerber)
    );
    assert_eq!(
      name("proj.gbl"),
      Layer(LayerKind::BottomCopper, Format::Gerber)
    );
    assert_eq!(
      name("Proj-Edge_Cuts.gbr"),
      Layer(LayerKind::Outline, Format::Gerber)
    );
    assert_eq!(name("proj.gko"), Layer(LayerKind::Outline, Format::Gerber));
    assert_eq!(name("proj.gm1"), Layer(LayerKind::Outline, Format::Gerber));
    assert_eq!(
      name("proj-PTH.drl"),
      Layer(LayerKind::Drill, Format::Excellon)
    );
    assert_eq!(name("proj.xln"), Layer(LayerKind::Drill, Format::Excellon));
  }

  #[test]
  fn skips_unsupported_names() {
    let name = |n: &str| kind_of(n, "");
    assert_eq!(name("Proj-F_Mask.gbr"), Skip(MASK.into()));
    assert_eq!(name("proj.gts"), Skip(MASK.into()));
    assert_eq!(name("Proj-B_Silkscreen.gbr"), Skip(SILK.into()));
    assert_eq!(name("Proj-F_Paste.gbr"), Skip(PASTE.into()));
    assert_eq!(name("Proj-In1_Cu.gbr"), Skip(INNER.into()));
    assert_eq!(name("proj.g2"), Skip(INNER.into()));
    assert_eq!(name("proj-job.gbrjob"), Skip(NOT_A_FILE.into()));
    assert_eq!(name("notes.md"), Skip(NOT_A_FILE.into()));
  }

  #[test]
  fn txt_needs_an_excellon_header() {
    assert_eq!(
      kind_of("holes.txt", "M48\nMETRIC\n"),
      Layer(LayerKind::Drill, Format::Excellon)
    );
    assert_eq!(kind_of("holes.txt", "hello"), Skip(NOT_A_FILE.into()));
  }
}
