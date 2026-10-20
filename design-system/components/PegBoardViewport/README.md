# PegBoardViewport

The 3D viewport frame that shows the peg-board floor, the pegged PCB, copper traces and the laser head, with side switch, board tools, offset readout and legend overlaid as HTML chrome.

## What the consumer provides
- `side` (`model<'top' | 'bottom'>`): drives the Top | Bottom segmented control and the mirrored board.
- `tool` (`model<'move' | 'rotate' | 'flip'>`): the active board tool. `rotate` and `flip` are one-shot actions in the app and emit `boardRotated` / `boardFlipped` outputs.
- `offset` (`input<{x: number, y: number}>`): board offset in mm, shown as "Offset X 12.50 Y 6.00 mm" and applied to the G-code.
- The scene itself (WebGL canvas or SVG) is projected into the frame; the chrome stays HTML on top of it.

## When to use
One per workspace screen, as the main canvas. Use the same frame for live jobs and simulation; only the engraved (`scene-done`) share changes.

## Do / Don't
- Do draw the scene only with `scene-*` tokens; the board always gets a `border-strong` rim (it is 2.4:1 on the floor in dark).
- Do keep overlay chips on `surface-200` with a `border-strong` border so they read on any scene colour.
- Do show the legend text next to every swatch; engraved vs copper is not told by colour alone (also: engraved is thicker).
- Don't put text directly on the scene without a halo (the "Origin peg" label uses a floor-coloured stroke).
- Don't hard-code hex in scene shaders or SVG; read the custom properties.

## Tokens
`scene-bg scene-floor scene-peg scene-board scene-copper scene-laser scene-done`, `surface-200`, `surface-sunken`, `border-strong`, `accent-soft`, `accent-strong`, `ink`, `ink-muted`, `ring`, `radius-lg`, `radius-md`, `radius-sm`, `space-2`, `space-3`, `shadow-sm`.

## Accessibility
- The scene is `role="img"` with an `aria-label` describing board position and job state; update it when the state changes.
- Side switch is a `radiogroup` of native radios (arrow keys move the selection); tool buttons are `role=group` named "Move board", icon-only buttons carry `aria-label`, the active one `aria-pressed="true"`.
- Icons: Phosphor Regular, `fill: currentColor`, 20px; the active move tool switches to the Fill weight.
- Drag-to-move needs a keyboard route: arrow keys nudge the board by 0.5 mm (Shift for 5 mm) while the viewport has focus, announced via the offset chip.
- Focus ring: 2px `ring`, 2px offset. Controls are at least 32px.
