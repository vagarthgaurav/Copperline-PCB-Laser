//! Reads the text files out of a zip archive behind the `read_gerber_zip`
//! Tauri command. The result feeds `parse_gerber_files` on the Angular side.

use super::model::InputFile;
use std::collections::HashMap;
use std::io::{Cursor, Read};
use tauri::ipc::{InvokeBody, Request};
use zip::ZipArchive;
use zip::result::ZipError;

/// Zip-bomb guards. Sizes are measured on the bytes actually read, never on
/// the sizes declared in the archive.
#[derive(Debug, Clone, Copy)]
struct Limits {
  entries: usize,
  entry_bytes: u64,
  total_bytes: u64,
}

const LIMITS: Limits = Limits {
  entries: 500,
  entry_bytes: 64 * 1024 * 1024,
  total_bytes: 256 * 1024 * 1024,
};

/// Takes the zip as the raw request body (not JSON) and returns its text files.
#[tauri::command]
pub async fn read_gerber_zip(request: Request<'_>) -> Result<Vec<InputFile>, String> {
  let InvokeBody::Raw(bytes) = request.body() else {
    return Err("Expected the zip archive as raw bytes.".into());
  };
  let bytes = bytes.clone();
  tauri::async_runtime::spawn_blocking(move || read_zip(&bytes))
    .await
    .map_err(|e| e.to_string())?
}

/// Extracts the text files of a zip archive, in archive order.
pub fn read_zip(bytes: &[u8]) -> Result<Vec<InputFile>, String> {
  read_zip_with(bytes, LIMITS)
}

fn read_zip_with(bytes: &[u8], limits: Limits) -> Result<Vec<InputFile>, String> {
  let mut archive = ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid_archive())?;
  if archive.len() > limits.entries {
    return Err(format!(
      "The zip archive has too many files (more than {}).",
      limits.entries
    ));
  }

  let mut total: u64 = 0;
  let mut found: Vec<(String, String)> = Vec::new();
  for index in 0..archive.len() {
    let mut entry = match archive.by_index(index) {
      Ok(entry) => entry,
      Err(ZipError::UnsupportedArchive(ZipError::PASSWORD_REQUIRED)) => {
        return Err("The zip archive is password protected.".into());
      }
      Err(_) => return Err(invalid_archive()),
    };
    if entry.is_dir() {
      continue;
    }
    let path = entry.name().replace('\\', "/");
    if !is_candidate(&path) {
      continue;
    }

    let mut data = Vec::new();
    // One byte past the limit tells "exactly at the limit" from "over it".
    let read = entry
      .by_ref()
      .take(limits.entry_bytes + 1)
      .read_to_end(&mut data)
      .map_err(|_| invalid_archive())? as u64;
    if read > limits.entry_bytes {
      return Err(format!(
        "A file in the zip archive is too large (over {} MiB).",
        limits.entry_bytes / (1024 * 1024)
      ));
    }
    total += read;
    if total > limits.total_bytes {
      return Err(format!(
        "The zip archive is too large (over {} MiB uncompressed).",
        limits.total_bytes / (1024 * 1024)
      ));
    }
    if data.contains(&0) {
      continue; // binary: image, pdf, nested zip, ...
    }
    found.push((path, String::from_utf8_lossy(&data).into_owned()));
  }

  // Base names are the layer ids, so they must be unique.
  let mut counts: HashMap<&str, usize> = HashMap::new();
  for (path, _) in &found {
    *counts.entry(base_name(path)).or_default() += 1;
  }
  let names: Vec<String> = found
    .iter()
    .map(|(path, _)| {
      let base = base_name(path);
      if counts[base] > 1 { path.clone() } else { base.to_string() }
    })
    .collect();
  Ok(
    names
      .into_iter()
      .zip(found)
      .map(|(name, (_, content))| InputFile { name, content })
      .collect(),
  )
}

fn invalid_archive() -> String {
  "That file is not a valid zip archive.".into()
}

fn base_name(path: &str) -> &str {
  path.rsplit('/').next().unwrap_or(path)
}

/// Skips macOS resource forks and hidden files.
fn is_candidate(path: &str) -> bool {
  let in_macosx = path.split('/').any(|part| part == "__MACOSX");
  !in_macosx && !base_name(path).starts_with('.') && !base_name(path).is_empty()
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::io::Write;
  use zip::write::SimpleFileOptions;
  use zip::{CompressionMethod, ZipWriter};

  enum Item<'a> {
    File(&'a str, &'a [u8]),
    Dir(&'a str),
  }

  fn build(items: &[Item]) -> Vec<u8> {
    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    for item in items {
      match item {
        Item::File(name, data) => {
          writer.start_file(*name, options).unwrap();
          writer.write_all(data).unwrap();
        }
        Item::Dir(name) => writer.add_directory(*name, options).unwrap(),
      }
    }
    writer.finish().unwrap().into_inner()
  }

  fn files(items: &[Item]) -> Vec<(String, String)> {
    read_zip(&build(items))
      .unwrap()
      .into_iter()
      .map(|f| (f.name, f.content))
      .collect()
  }

  fn pair(name: &str, content: &str) -> (String, String) {
    (name.to_string(), content.to_string())
  }

  #[test]
  fn extracts_plain_files_in_order() {
    let got = files(&[Item::File("b.gbr", b"G04 b*"), Item::File("a.drl", b"M48")]);
    assert_eq!(got, vec![pair("b.gbr", "G04 b*"), pair("a.drl", "M48")]);
  }

  #[test]
  fn subfolder_files_use_the_base_name() {
    let got = files(&[Item::File("board/gerbers/top.gbr", b"X")]);
    assert_eq!(got, vec![pair("top.gbr", "X")]);
  }

  #[test]
  fn duplicate_base_names_keep_their_paths() {
    let got = files(&[
      Item::File("a/top.gbr", b"1"),
      Item::File("b/top.gbr", b"2"),
      Item::File("other.drl", b"3"),
    ]);
    assert_eq!(
      got,
      vec![pair("a/top.gbr", "1"), pair("b/top.gbr", "2"), pair("other.drl", "3")]
    );
  }

  #[test]
  fn skips_macosx_and_dotfiles() {
    let got = files(&[
      Item::File("__MACOSX/._top.gbr", b"junk"),
      Item::File("__MACOSX/board/top.gbr", b"junk"),
      Item::File(".DS_Store", b"junk"),
      Item::File("board/.hidden", b"junk"),
      Item::File("board/top.gbr", b"ok"),
    ]);
    assert_eq!(got, vec![pair("top.gbr", "ok")]);
  }

  #[test]
  fn skips_binary_files() {
    let got = files(&[
      Item::File("photo.png", b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR"),
      Item::File("top.gbr", b"ok"),
    ]);
    assert_eq!(got, vec![pair("top.gbr", "ok")]);
  }

  #[test]
  fn skips_directories() {
    let got = files(&[Item::Dir("board/"), Item::File("board/top.gbr", b"ok")]);
    assert_eq!(got, vec![pair("top.gbr", "ok")]);
  }

  #[test]
  fn decodes_non_utf8_text_lossily() {
    let got = files(&[Item::File("top.gbr", b"G04 caf\xe9*")]);
    assert_eq!(got, vec![pair("top.gbr", "G04 caf\u{fffd}*")]);
  }

  #[test]
  fn invalid_bytes_are_an_error() {
    let err = read_zip(b"definitely not a zip").unwrap_err();
    assert_eq!(err, "That file is not a valid zip archive.");
  }

  #[test]
  fn empty_archive_gives_no_files() {
    assert!(files(&[]).is_empty());
  }

  #[test]
  fn archive_with_only_junk_gives_no_files() {
    assert!(files(&[Item::File("__MACOSX/x", b"j"), Item::Dir("d/")]).is_empty());
  }

  #[test]
  fn too_many_entries_is_an_error() {
    let zip = build(&[Item::File("a", b"1"), Item::File("b", b"2"), Item::File("c", b"3")]);
    let limits = Limits { entries: 2, ..LIMITS };
    assert!(read_zip_with(&zip, limits).unwrap_err().contains("too many files"));
    let limits = Limits { entries: 3, ..LIMITS };
    assert_eq!(read_zip_with(&zip, limits).unwrap().len(), 3);
  }

  #[test]
  fn oversized_entry_is_an_error() {
    let zip = build(&[Item::File("a.gbr", &[b'x'; 11])]);
    let limits = Limits { entry_bytes: 10, ..LIMITS };
    assert!(read_zip_with(&zip, limits).unwrap_err().contains("too large"));
    let limits = Limits { entry_bytes: 11, ..LIMITS };
    assert_eq!(read_zip_with(&zip, limits).unwrap().len(), 1);
  }

  #[test]
  fn oversized_total_is_an_error() {
    let zip = build(&[Item::File("a", &[b'x'; 8]), Item::File("b", &[b'y'; 8])]);
    let limits = Limits { total_bytes: 15, ..LIMITS };
    assert!(read_zip_with(&zip, limits).unwrap_err().contains("too large"));
    let limits = Limits { total_bytes: 16, ..LIMITS };
    assert_eq!(read_zip_with(&zip, limits).unwrap().len(), 2);
  }

  #[test]
  fn default_limits_match_the_spec() {
    assert_eq!(LIMITS.entries, 500);
    assert_eq!(LIMITS.entry_bytes, 64 * 1024 * 1024);
    assert_eq!(LIMITS.total_bytes, 256 * 1024 * 1024);
  }
}
