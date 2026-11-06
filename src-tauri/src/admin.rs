//! The admin password that unlocks the Simulate and Machine tabs on the kiosk.
//! This is a lock against casual use, not strong security: the machine is
//! physically in the room. Only a salted SHA-256 is stored, in a file the
//! kiosk image owns (`COPPERLINE_ADMIN_FILE`, else the app config folder).

use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Used until an admin file exists. Change it before handing the machine over (see kiosk/README.md).
const DEFAULT_PASSWORD: &str = "copperline";

fn hash(password: &str) -> String {
  let digest = Sha256::digest(format!("copperline:{password}").as_bytes());
  digest.iter().map(|b| format!("{b:02x}")).collect()
}

fn admin_file(app: &AppHandle) -> Option<PathBuf> {
  if let Ok(path) = std::env::var("COPPERLINE_ADMIN_FILE") {
    return Some(PathBuf::from(path));
  }
  app.path().app_config_dir().ok().map(|dir| dir.join("admin.sha256"))
}

/// Compares in constant time so the answer does not leak how much matched.
fn same(a: &str, b: &str) -> bool {
  a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn matches_stored(stored: Option<&str>, password: &str) -> bool {
  let expected = match stored {
    Some(text) => text.trim().to_lowercase(),
    None => hash(DEFAULT_PASSWORD),
  };
  same(&expected, &hash(password))
}

#[tauri::command]
pub fn verify_admin_password(app: AppHandle, password: String) -> bool {
  let stored = admin_file(&app).and_then(|path| fs::read_to_string(path).ok());
  matches_stored(stored.as_deref(), &password)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn default_password_works_without_a_file() {
    assert!(matches_stored(None, "copperline"));
    assert!(!matches_stored(None, "wrong"));
  }

  #[test]
  fn stored_hash_replaces_the_default() {
    let stored = format!("{}\n", hash("s3cret"));
    assert!(matches_stored(Some(&stored), "s3cret"));
    assert!(!matches_stored(Some(&stored), "copperline"));
  }
}
