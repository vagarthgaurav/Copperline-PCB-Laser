use tauri::Manager;

mod admin;
mod gcode;
mod gerber;
mod serial;
mod usb;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(gerber::ProjectStore::default())
    .manage(serial::SerialStore::default())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // Dev-only display scale (e.g. COPPERLINE_ZOOM=1.25) for screens where the system scale is too coarse.
      if let Some(zoom) = std::env::var("COPPERLINE_ZOOM").ok().and_then(|z| z.parse::<f64>().ok()) {
        if let Some(window) = app.get_webview_window("main") {
          window.set_zoom(zoom)?;
        }
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      gerber::parse_gerber_files,
      gerber::archive::read_gerber_zip,
      gcode::generate_gcode,
      serial::list_serial_ports,
      serial::serial_connect,
      serial::serial_disconnect,
      serial::serial_write,
      serial::serial_write_realtime,
      usb::list_usb_drives,
      usb::list_usb_dir,
      usb::read_usb_file,
      admin::verify_admin_password
    ])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
