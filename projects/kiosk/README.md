# Copperline Kiosk

The operator version of Copperline for the official 7 inch Raspberry Pi touch display (800 × 480) on a Raspberry Pi 3B+. Operators see one screen: pick a board from a USB stick, drag it into place on a 2D peg board, flip or rotate it, home the machine, Start and Stop. Simulate and Machine stay hidden behind an admin password.

It is a second Angular app in this workspace (`projects/kiosk`). It shares the services, the Rust backend (Gerber parsing, G-code, serial) and the UI components with the desktop app through the `@app/*` path alias (`src/app/*`), so a fix to one lands in both.

## Run it

```sh
pnpm kiosk                 # browser at http://localhost:4300 (no Gerber parsing, serial or USB there)
pnpm tauri:kiosk           # the real thing: Tauri window with the Rust backend
pnpm kiosk:test            # kiosk unit tests
COPPERLINE_USB_ROOT=/path/to/folder pnpm tauri:kiosk   # pretend a folder is the USB stick
```

## What operators can do

- **Open board** lists the plugged-in USB sticks (anything mounted under `/media` or `/run/media`). Pick a zip or several Gerber and drill files.
- **Drag** the board on the peg board. It snaps to the peg grid when the board's peg holes fit it, and stays on the floor. **Rotate** and **Flip** (top/bottom side) are buttons.
- **Home**, **Home X**, **Home Y**.
- **Start** asks "Start engraving?", generates the G-code for what is on screen and streams it to the machine. **Stop** halts at once (feed hold, then soft reset, which turns the laser off). No question is asked for Stop.
- The machine connects by itself: it uses the last working serial port, else the first USB serial port, and retries every 3 s.

## Admin

**Admin** in the top bar asks for a password on an on-screen keyboard. It adds the Simulate and Machine tabs (the desktop pages, unchanged). They lock again after 5 minutes without a touch or on **Lock**. Automatic reconnect pauses while the admin tabs are open.

The password is checked in Rust (`src-tauri/src/admin.rs`). Until a file exists the password is **`copperline`**. Change it before handing the machine over:

```sh
sudo mkdir -p /etc/copperline
printf 'copperline:%s' 'YOUR-NEW-PASSWORD' | sha256sum | cut -d' ' -f1 | sudo tee /etc/copperline/admin.sha256
# then start the app with COPPERLINE_ADMIN_FILE=/etc/copperline/admin.sha256
```

Without `COPPERLINE_ADMIN_FILE` the file is `admin.sha256` in the app's config folder (for example `~/.config/com.vagarth.pcblaser.kiosk/`). This keeps casual users out; it is not strong security.

## Building for the Pi

Use the 64-bit Raspberry Pi OS (Bookworm, with a desktop or a kiosk compositor such as `cage`). Building on a Pi 3B+ (1 GB RAM) is not practical: build on an arm64 machine or container with the Tauri Linux dependencies (`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, …).

```sh
pnpm tauri:kiosk:build     # makes a .deb under src-tauri/target/release/bundle/deb
```

On the Pi:

- The user running the app must be in the `dialout` group to open `/dev/ttyACM0` or `/dev/ttyUSB0`.
- Sticks must be auto-mounted under `/media/<user>/` (the Raspberry Pi OS desktop does this; on a headless kiosk install `udisks2` and `udiskie`).
- Start the app on boot, for example from `cage -- copperline-kiosk` in a systemd service.

## Not done yet / open

- Not yet run on a real Pi 3B+. The first check is how WebKitGTK performs there (dragging the board is cheap: the art is drawn to a bitmap once per orientation).
- Laser power, feed rate and spot size use the defaults (65 %, 1200 mm/min, 0.1 mm). There is no screen for them in the kiosk yet, and they are not saved between runs.
- The Simulate and Machine pages are the desktop layouts. They work but are cramped at 800 × 480.
- There is no Pause button in the kiosk (the service supports it).
