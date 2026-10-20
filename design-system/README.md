Copperline is the interface for a laser machine that engraves photo-resist on copper-clad PCBs. The user loads a Gerber, sees it as a 3D board pegged on the machine floor, drags it into position, flips it for the second side, simulates the job and exports G-code or streams it to the machine. The look is a calm workshop: warm stone surfaces, one copper accent, PCB-mask green for "connected" and "done". It ships in a light and a dark theme with identical token names.

## Content fundamentals

- Write for someone standing at the machine. Short imperative buttons: "Export G-code", "Flip to bottom", "Start engraving". Sentence case everywhere; uppercase only in the `label` style.
- Say what will physically happen: "Board overhangs the peg grid by 2.5 mm", not "Invalid position". Always give units: `12.50 mm`, `1200 mm/min`, `65%`.
- Address the user as "you" only in help text; never "I" or "we". No exclamation marks, no emoji.
- Simulation must be unmistakable: "Simulating — nothing is sent to the machine". Live jobs say "Engraving" with the port name.
- Numbers that come from the machine are monospace (`readout`, `code`); numbers the user types use `body`.

## Visual foundations

- **Surfaces.** App background is `surface-100`. Panels, the top bar and the G-code viewer are `surface-200`. Inputs and popovers are `surface-300`. Wells and slider tracks are `surface-sunken`. Panels use `radius-lg`, a 1px `border` and no shadow; only popovers and dialogs get `shadow-md`.
- **Text.** `ink` for primary text, `ink-muted` for labels and units. Both hold 4.5:1 or better on every `surface-*` token in both themes.
- **Accent.** `accent` is copper and is used sparingly: the one primary button per view, the active tab marker, progress fills. Text on it is `on-accent`. Hover goes to `accent-strong`. Selected rows and the current G-code line use `accent-soft`.
- **Status.** Connected, done and success use `mask` on `mask-soft`; warnings use `warning` on `warning-soft`; faults use `danger` on `danger-soft`. Every status carries a word or an icon as well as colour. Do not place a green and a red chip next to each other with only the colour to tell them apart.
- **Focus.** A solid 2px `ring` outline with 2px offset on `:focus-visible`. `ring` is deliberately cool blue so it never reads as the copper accent.
- **Type.** `display`, `title` and `heading` use Bricolage Grotesque; all UI text uses Instrument Sans; G-code, console and position readouts use JetBrains Mono. All three load from Google Fonts. Controls are 36px high (`body-strong` labels), 32px in dense toolbars.
- **Spacing and radius.** Panel padding `space-4`, gap between panels `space-2`, gap between sections `space-6`. Buttons, inputs and tabs `radius-md`; chips, switches and slider thumbs `radius-pill`.
- **Motion.** None is required. Do not animate the laser or progress beyond what the real position data drives.
- **The 3D scene.** Paint the viewport only with `scene-*` tokens: `scene-bg` behind, `scene-floor` for the peg board, `scene-peg` for holes and pegs, `scene-board` for the PCB (with a `border-strong` rim in the dark theme), `scene-copper` for Gerber copper, `scene-laser` for the head and beam, `scene-done` for engraved copper. Three.js materials read these values from CSS custom properties at theme change, never from literals.

## Peg board and placement rules

- The peg board floor is the origin of machine coordinates. The board's offset from the pegs is shown as `Offset X … Y …` in a `readout` chip and is added to every move in the exported G-code.
- Top and Bottom are a two-option segmented control. Bottom mirrors the board across the vertical peg axis; the preview shows the mirrored copper.
- A board that leaves the peg grid or the laser's reach shows a `warning` banner and disables "Start engraving", never silently clips.

## Iconography

Icons are [Phosphor](https://phosphoricons.com) (`@phosphor-icons/core`, MIT). Use the Regular weight at 20px (16px inside chips and dense toolbars), `fill="currentColor"`, viewBox `0 0 256 256`. Use the Fill weight only for a selected or active state (for example the active move tool). In Angular use `@phosphor-icons/web` or inline the SVG; do not mix in another icon set. Icon-only buttons always have an `aria-label`; icons beside a visible label are `aria-hidden="true"`. Never use emoji as icons.

Icons the app uses: `play`, `pause`, `skip-back`, `skip-forward`, `arrow-counter-clockwise` (restart), `arrows-out-cardinal` (move board), `arrow-clockwise` (rotate 90°), `flip-horizontal` (flip side), `cube` (3D view), `folder-open` (open Gerber), `download-simple` (export), `plugs-connected` and `plugs` (connection), `stop`, `house` (home), `sun` and `moon` (theme), `check-circle`, `warning`, `x-circle`, `crosshair` (laser position), `caret-down`, `check`.

## Using it in Angular

- Load `tokens.css` once at the root and set `data-theme="light"` or `"dark"` on `<html>`. Default to the OS setting through `prefers-color-scheme`, persist the user's explicit choice.
- Style with the CSS custom properties; do not copy hex values. Components are small standalone Angular components with signal inputs; previews in this system show the intended markup and states.
- Targets: WCAG AA, axe clean. Every interactive element is reachable by keyboard, and the 3D board can also be moved with the arrow keys (1 mm, Shift = 0.1 mm) and numeric offset fields.

## In this repo

- `design-system/tokens.json` is the single source for colour, type, spacing, radius and shadow. Edit it, then run `pnpm tokens` to regenerate `src/styles/tokens.css` (loaded globally from `angular.json`). Never edit `tokens.css` by hand.
- `design-system/components/<Name>/preview.html` are static, framework-free references for how each component looks in every state, with its guidelines in the `README.md` beside it. Open one in a browser after temporarily adding `<link rel="stylesheet" href="../../../src/styles/tokens.css">`, or build the real Angular component and match it.
- Fonts are not bundled yet. Install `@fontsource-variable/bricolage-grotesque`, `@fontsource-variable/instrument-sans` and `@fontsource-variable/jetbrains-mono` before the first release so the Tauri app works offline.
