//! Serial link to the machine (grblHAL over USB CDC). The reader thread turns
//! incoming bytes into lines and emits them as `serial-line` events; writes go
//! straight to the port.

use serialport::{SerialPort, SerialPortType};
use std::io::{ErrorKind, Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

const READ_TIMEOUT: Duration = Duration::from_millis(100);

struct Connection {
  writer: Box<dyn SerialPort>,
  stop: Arc<AtomicBool>,
  reader: Option<JoinHandle<()>>,
}

impl Connection {
  fn close(mut self) {
    self.stop.store(true, Ordering::Relaxed);
    if let Some(reader) = self.reader.take() {
      let _ = reader.join();
    }
  }
}

#[derive(Default)]
pub struct SerialStore(Mutex<Option<Connection>>);

/// The names of the serial ports on this computer, USB devices first.
#[tauri::command]
pub fn list_serial_ports() -> Result<Vec<String>, String> {
  let mut ports: Vec<(bool, String)> = serialport::available_ports()
    .map_err(|e| format!("Could not list serial ports: {e}"))?
    .into_iter()
    .map(|p| (matches!(p.port_type, SerialPortType::UsbPort(_)), p.port_name))
    .collect();
  ports.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
  Ok(ports.into_iter().map(|(_, name)| name).collect())
}

/// Opens `port` and starts reading. Any earlier connection is closed first.
#[tauri::command]
pub fn serial_connect(app: AppHandle, store: State<SerialStore>, port: String, baud: u32) -> Result<(), String> {
  let mut slot = store.0.lock().map_err(|_| "Serial state is poisoned".to_string())?;
  if let Some(old) = slot.take() {
    old.close();
  }
  let writer = serialport::new(&port, baud)
    .timeout(READ_TIMEOUT)
    .open()
    .map_err(|e| format!("Could not open {port}: {e}"))?;
  let mut source = writer.try_clone().map_err(|e| format!("Could not open {port}: {e}"))?;
  let stop = Arc::new(AtomicBool::new(false));
  let flag = stop.clone();
  let reader = std::thread::spawn(move || {
    let mut pending: Vec<u8> = Vec::new();
    let mut buf = [0u8; 512];
    let mut failed = false;
    while !flag.load(Ordering::Relaxed) {
      match source.read(&mut buf) {
        Ok(0) => {}
        Ok(n) => {
          pending.extend_from_slice(&buf[..n]);
          while let Some(end) = pending.iter().position(|&b| b == b'\n') {
            let raw: Vec<u8> = pending.drain(..=end).collect();
            let line = String::from_utf8_lossy(&raw).trim_end().to_string();
            if !line.is_empty() {
              let _ = app.emit("serial-line", line);
            }
          }
        }
        Err(e) if matches!(e.kind(), ErrorKind::TimedOut | ErrorKind::Interrupted) => {}
        Err(_) => {
          failed = true;
          break;
        }
      }
    }
    if failed {
      let _ = app.emit("serial-closed", "The serial port was lost. Is the machine still plugged in?");
    }
  });
  *slot = Some(Connection { writer, stop, reader: Some(reader) });
  Ok(())
}

#[tauri::command]
pub fn serial_disconnect(store: State<SerialStore>) -> Result<(), String> {
  let mut slot = store.0.lock().map_err(|_| "Serial state is poisoned".to_string())?;
  if let Some(connection) = slot.take() {
    connection.close();
  }
  Ok(())
}

/// Writes `data` exactly as given (the caller adds the newline for commands).
#[tauri::command]
pub fn serial_write(store: State<SerialStore>, data: String) -> Result<(), String> {
  let mut slot = store.0.lock().map_err(|_| "Serial state is poisoned".to_string())?;
  let connection = slot.as_mut().ok_or("Not connected to a machine")?;
  connection
    .writer
    .write_all(data.as_bytes())
    .and_then(|_| connection.writer.flush())
    .map_err(|e| format!("Could not write to the machine: {e}"))
}

/// Writes one real-time byte (`?` status, 0x18 soft reset, 0x85 jog cancel). grblHAL acts on these
/// as soon as they arrive, without waiting for a newline.
#[tauri::command]
pub fn serial_write_realtime(store: State<SerialStore>, byte: u8) -> Result<(), String> {
  let mut slot = store.0.lock().map_err(|_| "Serial state is poisoned".to_string())?;
  let connection = slot.as_mut().ok_or("Not connected to a machine")?;
  connection
    .writer
    .write_all(&[byte])
    .and_then(|_| connection.writer.flush())
    .map_err(|e| format!("Could not write to the machine: {e}"))
}
