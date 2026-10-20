# Copperline UI mockups

Static HTML mockups of the desktop app. They are the visual target for the Angular frontend. Open any file in a browser (1520 × 980 canvas, window is 1440 × 900); the three workspace files link to each other through the tabs.

| File | Screen | Theme shown |
| --- | --- | --- |
| `design.html` | Design: load Gerber, place the board on the peg board, set offset, side and laser settings, preview G-code | light |
| `simulate.html` | Simulate: dry-run replay on the 3D board and in the G-code viewer | dark |
| `machine.html` | Machine: serial connection, live engraving, job controls | light |
| `window-chrome.html` | Custom title bar: both themes, every button state, inactive and maximized windows | both |
| `copperline.css` | Tokens plus the shared mockup styles | both |

Treat the mockups as a reference, not code to copy. Rebuild them as Angular components that follow `CLAUDE.md`.

## Rules

1. **Tokens only.** Colours, type, spacing and radii come from `src/styles/tokens.css` (generated from `design-system/tokens.json` by `npm run tokens`). Do not copy hex values out of `copperline.css`. Its `--stage`, `--win-edge` and `--win-shadow` variables belong to the mockup frame only; the real window needs none of them.
2. **Component specs win.** `design-system/components/<Name>/README.md` holds the props, accessibility rules and do/don'ts for AppShell, Button, Field, StatusChip, PegBoardViewport, GcodeViewer, SimulationControls and MachineStatus. The mockups show how they combine.
3. **Icons** are Phosphor Regular (Fill only for active or selected states), inline SVG, `viewBox="0 0 256 256"`, `fill="currentColor"`. Do not add another icon set.
4. **Light and dark.** `data-theme` on `<html>`, default from `prefers-color-scheme`, explicit choice persisted. The theme button in the title bar toggles it.
5. **Accessibility.** WCAG AA and axe clean. Real `<button>`, `<a>`, `<label>`. Icon-only buttons need an `aria-label`.
6. **Placeholder data.** Every number (G-code lines, board geometry, positions, times) is invented. Do not hard-code it. Derive it from the parsed Gerber and the machine.

## Window chrome (Tauri)

The OS frame is replaced by an in-app title bar. See `window-chrome.html`.

- `src-tauri/tauri.conf.json`: set `"decorations": false` on the `main` window and size it around 1440 × 900 with a sensible `minWidth`/`minHeight` (about 1100 × 700). Check macOS and Windows 11 corner and shadow behaviour before shipping.
- `src-tauri/capabilities/default.json`: add `core:window:allow-minimize`, `core:window:allow-toggle-maximize`, `core:window:allow-close`, `core:window:allow-start-dragging`, `core:window:allow-is-maximized`, and `core:window:allow-set-focus` if the inactive state needs it.
- Build one standalone `TitleBar` component. It uses `getCurrentWindow()` from `@tauri-apps/api/window`. Keep `maximized` and `focused` as signals, updated from `onResized` and `onFocusChanged`.
- Drag: put `data-tauri-drag-region` on the bar's empty areas only (the spacer and the file chip). Never on buttons or tabs. Double-click on the drag region toggles maximize.
- Layout: bar height 48 px. Left: brand mark and name, then the Design / Simulate / Machine tabs (`role="tablist"`, active tab marked with a 3 px accent underline and `--ink` text). Centre: file chip. Right: status chip, theme toggle, the one primary "Export G-code" button, a divider, then window buttons.
- Window buttons are 38 × 36 px with `--radius-md` and a 2 px gap. Hover is `--surface-sunken`. Close hover is `--danger-soft` with `--danger` text, and pressed is solid `--danger`. Maximized swaps the square icon for the restore icon (Phosphor `copy`) and drops the window corner radius to 0. An unfocused window dims the brand mark, tabs, chip and buttons.
- On a Linux or Windows window the controls sit at the right. Do not mimic macOS traffic lights.

## Layout shared by the three workspaces

```
TitleBar (48px)
Body: grid 264px | 1fr | 320px, 16px padding, 16px gap
  Left panel   surface-200, radius-lg, 1px border   per-screen settings
  Centre       3D viewport (flex 1) + optional bottom bar
  Right panel  placement or current-move tiles + G-code viewer (flex 1)
```

- **Design:** left = Project (file card, "Open Gerber…"), Layers, Placement (offset X/Y, side, mirror), Engraving (power, feed). Centre = viewport only. Right = offset tiles and G-code preview with an Export button.
- **Simulate:** left = dry-run summary, layer progress, job settings, links to Design and Machine. Centre = viewport plus the SimulationControls bar. Right = current move tiles and G-code with the current line.
- **Machine:** left = Connection, Position, Job, Console. Centre = viewport plus a job bar with Pause, Stop (danger outline), Home and a progress bar. Right = current move tiles and live G-code.

Viewport overlays (HTML on top of the scene): side switch top-left, board tools top-right, status chip top-centre, offset chip bottom-left, legend bottom-right.

## 3D scene

The mockup draws an SVG approximation of the peg board. The real scene is Three.js, in a component that:

- Draws only with `scene-*` tokens, read from CSS custom properties at theme change (never literals). Board rim uses `--border-strong`.
- Shows the peg-board floor with a hole grid and two alignment pegs (the origin peg is labelled). The board rests against the pegs and can be dragged; arrow keys nudge it by 1 mm (Shift = 0.1 mm), mirrored by numeric offset fields.
- Renders Gerber copper (`scene-copper`), engraved copper (`scene-done`, thicker), the laser head and beam (`scene-laser`) and the remaining path as dashes.
- Flips for the Bottom side: the board is mirrored across the vertical peg axis.
- Gets a text alternative (`role="img"` plus `aria-label`) that is updated as the state changes.

## Suggested build order

1. Theme service and `TitleBar` plus the Tauri window changes above. Check it runs in `npm run tauri dev` with no OS frame.
2. `AppShell` with the three routes (lazy loaded) and the shared panel layout.
3. Shared pieces: Button, Field, StatusChip, layer list, tiles.
4. Gerber parsing, then the Three.js `PegBoardViewport` (static board first, then drag and flip).
5. G-code generation from the placed board, then `GcodeViewer`.
6. Simulation (`SimulationControls`) driving the viewport and viewer from one position signal.
7. Machine connection (Rust serial commands, `MachineStatus`) and live progress.

Ask before changing the look. If a screen needs something the mockups and component specs do not cover, extend the design system first and keep the mockups in sync.
