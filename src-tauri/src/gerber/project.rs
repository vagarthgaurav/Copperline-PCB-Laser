//! Project-level derivations: name, board bounds and layer ordering.

use super::classify::file_attribute;
use super::geometry::{BoundsBuilder, primitives_bounds, round6};
use super::model::{BoardInfo, BoardSource, InputFile, LayerKind, ParsedLayer};

const NAME_TRIM: &[char] = &['-', '_', '.', ' '];

/// Common file-name prefix (without trailing `-_. `), else the X2
/// `TF.ProjectId`, else the first file name.
pub fn derive_name(files: &[InputFile]) -> String {
  if files.len() >= 2 {
    let prefix = common_prefix(files.iter().map(|f| f.name.as_str()));
    let trimmed = prefix.trim_end_matches(NAME_TRIM);
    if !trimmed.is_empty() {
      return trimmed.to_string();
    }
  }
  files
    .iter()
    .find_map(|f| file_attribute(&f.content, "ProjectId")?.into_iter().next())
    .filter(|id| !id.is_empty())
    .or_else(|| files.first().map(|f| f.name.clone()))
    .unwrap_or_default()
}

fn common_prefix<'a>(mut names: impl Iterator<Item = &'a str>) -> String {
  let Some(first) = names.next() else {
    return String::new();
  };
  let mut prefix: Vec<char> = first.chars().collect();
  for name in names {
    let common = prefix
      .iter()
      .zip(name.chars())
      .take_while(|(a, b)| **a == *b)
      .count();
    prefix.truncate(common);
  }
  prefix.into_iter().collect()
}

/// Outline centre lines if there is an outline, else the union of the copper
/// layers (else of everything, e.g. a lone drill file).
pub fn board_info(layers: &[ParsedLayer]) -> Option<BoardInfo> {
  if layers.is_empty() {
    return None;
  }
  let mut outline = BoundsBuilder::new();
  let mut copper = BoundsBuilder::new();
  let mut all = BoundsBuilder::new();
  for layer in layers {
    all.include_bounds(&layer.bounds);
    match layer.kind {
      LayerKind::Outline => {
        // The drawn edge is the board edge: measure its centre line.
        let b = primitives_bounds(&layer.primitives, false).unwrap_or(layer.bounds);
        outline.include_bounds(&b);
      }
      LayerKind::TopCopper | LayerKind::BottomCopper => copper.include_bounds(&layer.bounds),
      LayerKind::Drill => {}
    }
  }
  let (bounds, source) = if let Some(b) = outline.build() {
    (b, BoardSource::Outline)
  } else if let Some(b) = copper.build() {
    (b, BoardSource::Copper)
  } else {
    (all.build()?, BoardSource::Copper)
  };
  Some(BoardInfo {
    width: round6(bounds.max_x - bounds.min_x),
    height: round6(bounds.max_y - bounds.min_y),
    bounds,
    source,
  })
}

pub fn sort_layers(layers: &mut [ParsedLayer]) {
  layers.sort_by_key(|l| l.kind.order());
}
