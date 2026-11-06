//! Read-only access to USB pendrives for the kiosk. The commands only ever
//! touch paths under a mounted removable drive (`/media`, `/run/media`, or the
//! folder in `COPPERLINE_USB_ROOT` for development), never anything else.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::ipc::Response;

/// Largest file `read_usb_file` returns.
const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsbDrive {
  pub name: String,
  pub path: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsbEntry {
  pub name: String,
  pub path: String,
  pub is_dir: bool,
  pub size: u64,
}

/// Mount points of removable drives, taken from the text of `/proc/mounts`.
fn drives_from_mounts(mounts: &str) -> Vec<UsbDrive> {
  let mut drives: Vec<UsbDrive> = mounts
    .lines()
    .filter_map(|line| line.split_whitespace().nth(1))
    .map(unescape_mount_path)
    .filter(|path| path.starts_with("/media/") || path.starts_with("/run/media/"))
    .map(|path| UsbDrive {
      name: Path::new(&path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.clone()),
      path,
    })
    .collect();
  drives.sort_by(|a, b| a.path.cmp(&b.path));
  drives.dedup();
  drives
}

/// `/proc/mounts` writes a space as `\040`, a tab as `\011`, a newline as `\012` and a backslash as `\134`.
fn unescape_mount_path(raw: &str) -> String {
  let mut out = String::with_capacity(raw.len());
  let bytes = raw.as_bytes();
  let mut i = 0;
  let mut buf: Vec<u8> = Vec::new();
  while i < bytes.len() {
    if bytes[i] == b'\\' && i + 3 < bytes.len() && bytes[i + 1..i + 4].iter().all(|b| (b'0'..=b'7').contains(b)) {
      let value = (bytes[i + 1] - b'0') as u32 * 64 + (bytes[i + 2] - b'0') as u32 * 8 + (bytes[i + 3] - b'0') as u32;
      buf.push(value as u8);
      i += 4;
    } else {
      buf.push(bytes[i]);
      i += 1;
    }
  }
  out.push_str(&String::from_utf8_lossy(&buf));
  out
}

fn current_drives() -> Vec<UsbDrive> {
  if let Ok(root) = std::env::var("COPPERLINE_USB_ROOT") {
    let name = Path::new(&root).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| root.clone());
    return vec![UsbDrive { name, path: root }];
  }
  fs::read_to_string("/proc/mounts").map(|mounts| drives_from_mounts(&mounts)).unwrap_or_default()
}

/// Resolves `requested` and returns it only if it lies inside one of `roots` (symlinks and `..` resolved first).
fn resolve_under(roots: &[UsbDrive], requested: &str) -> Result<PathBuf, String> {
  let path = fs::canonicalize(requested).map_err(|e| format!("Could not open {requested}: {e}"))?;
  for root in roots {
    if let Ok(root) = fs::canonicalize(&root.path) {
      if path.starts_with(&root) {
        return Ok(path);
      }
    }
  }
  Err("That location is not on a USB drive.".into())
}

/// The removable drives that are mounted right now.
#[tauri::command]
pub fn list_usb_drives() -> Vec<UsbDrive> {
  current_drives()
}

/// The folders and files directly inside `path`, folders first, hidden entries left out.
#[tauri::command]
pub fn list_usb_dir(path: String) -> Result<Vec<UsbEntry>, String> {
  let dir = resolve_under(&current_drives(), &path)?;
  let mut entries: Vec<UsbEntry> = fs::read_dir(&dir)
    .map_err(|e| format!("Could not read the folder: {e}"))?
    .filter_map(Result::ok)
    .filter_map(|entry| {
      let name = entry.file_name().to_string_lossy().into_owned();
      if name.starts_with('.') {
        return None;
      }
      let meta = entry.metadata().ok()?;
      Some(UsbEntry { name, path: entry.path().to_string_lossy().into_owned(), is_dir: meta.is_dir(), size: meta.len() })
    })
    .collect();
  entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
  Ok(entries)
}

/// The raw bytes of one file on a USB drive.
#[tauri::command]
pub async fn read_usb_file(path: String) -> Result<Response, String> {
  tauri::async_runtime::spawn_blocking(move || {
    let file = resolve_under(&current_drives(), &path)?;
    let meta = fs::metadata(&file).map_err(|e| format!("Could not read the file: {e}"))?;
    if !meta.is_file() {
      return Err("That is not a file.".to_string());
    }
    if meta.len() > MAX_FILE_BYTES {
      return Err("That file is too large.".to_string());
    }
    fs::read(&file).map(Response::new).map_err(|e| format!("Could not read the file: {e}"))
  })
  .await
  .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn finds_only_removable_mounts() {
    let mounts = "/dev/sda1 / ext4 rw 0 0\n/dev/sdb1 /media/pi/MY\\040STICK vfat rw 0 0\ntmpfs /run/user/1000 tmpfs rw 0 0\n/dev/sdc1 /run/media/pi/DATA exfat rw 0 0\n";
    let drives = drives_from_mounts(mounts);
    assert_eq!(drives.len(), 2);
    assert_eq!(drives[0], UsbDrive { name: "MY STICK".into(), path: "/media/pi/MY STICK".into() });
    assert_eq!(drives[1], UsbDrive { name: "DATA".into(), path: "/run/media/pi/DATA".into() });
  }

  #[test]
  fn refuses_paths_outside_the_drive() {
    let root = std::env::temp_dir().join(format!("copperline-usb-{}", std::process::id()));
    let inside = root.join("drive");
    fs::create_dir_all(&inside).unwrap();
    fs::write(inside.join("a.gbr"), "x").unwrap();
    fs::write(root.join("secret.txt"), "x").unwrap();
    let roots = vec![UsbDrive { name: "drive".into(), path: inside.to_string_lossy().into_owned() }];

    assert!(resolve_under(&roots, inside.join("a.gbr").to_str().unwrap()).is_ok());
    assert!(resolve_under(&roots, root.join("secret.txt").to_str().unwrap()).is_err());
    let sneaky = format!("{}/../secret.txt", inside.display());
    assert!(resolve_under(&roots, &sneaky).is_err());
    let _ = fs::remove_dir_all(&root);
  }
}
