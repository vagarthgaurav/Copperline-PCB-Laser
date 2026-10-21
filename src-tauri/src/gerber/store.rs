//! The most recently parsed project, kept in Tauri state so G-code generation
//! can work from it without the UI sending geometry back.

use super::model::{LayerKind, ParsedProject};
use std::sync::{Mutex, MutexGuard};

/// Managed state: `None` until a project has been parsed.
#[derive(Debug, Default)]
pub struct ProjectStore(Mutex<Option<ParsedProject>>);

impl ProjectStore {
  /// Replaces the stored project.
  pub fn set(&self, project: ParsedProject) {
    *self.lock() = Some(project);
  }

  /// A copy of the stored project holding only the layers of `kind`, so the
  /// lock is released quickly and unrelated geometry is not copied.
  pub fn snapshot_layers(&self, kind: LayerKind) -> Option<ParsedProject> {
    let guard = self.lock();
    let project = guard.as_ref()?;
    Some(ParsedProject {
      name: project.name.clone(),
      board: project.board.clone(),
      layers: project
        .layers
        .iter()
        .filter(|l| l.kind == kind)
        .cloned()
        .collect(),
      skipped: Vec::new(),
    })
  }

  fn lock(&self) -> MutexGuard<'_, Option<ParsedProject>> {
    // A panic while holding the lock cannot leave the project half-written.
    self
      .0
      .lock()
      .unwrap_or_else(|poisoned| poisoned.into_inner())
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::gerber::{InputFile, parse_project};

  fn project() -> ParsedProject {
    parse_project(&[InputFile {
      name: "b-F_Cu.gbr".into(),
      content: "%FSLAX24Y24*%\n%MOMM*%\n%ADD10C,0.2*%\nD10*\nX0Y0D02*\nX10000Y0D01*\nM02*\n".into(),
    }])
  }

  #[test]
  fn starts_empty() {
    assert!(
      ProjectStore::default()
        .snapshot_layers(LayerKind::TopCopper)
        .is_none()
    );
  }

  #[test]
  fn stores_and_filters_layers() {
    let store = ProjectStore::default();
    store.set(project());
    let top = store
      .snapshot_layers(LayerKind::TopCopper)
      .expect("project stored");
    assert_eq!(top.layers.len(), 1);
    assert!(top.board.is_some());
    let bottom = store
      .snapshot_layers(LayerKind::BottomCopper)
      .expect("project stored");
    assert!(bottom.layers.is_empty());
  }

  #[test]
  fn set_replaces_the_project() {
    let store = ProjectStore::default();
    store.set(project());
    store.set(ParsedProject {
      name: "second".into(),
      layers: Vec::new(),
      skipped: Vec::new(),
      board: None,
    });
    assert_eq!(
      store.snapshot_layers(LayerKind::TopCopper).unwrap().name,
      "second"
    );
  }
}
