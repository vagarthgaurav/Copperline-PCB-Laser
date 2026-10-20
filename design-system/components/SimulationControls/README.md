# SimulationControls

A transport bar for the dry-run simulation: play/pause, step, restart, speed, scrubber and elapsed time, with a permanent reminder that nothing is sent to the machine.

## What the consumer provides
- `playing` (`model<boolean>`): toggles the primary button between Play and Pause.
- `speed` (`model<1 | 4 | 16 | 64>`): the speed segmented control.
- `position` (`model<number>`) and `duration` (`input<number>`): seconds; the scrubber and the "03:12 / 09:48" readout derive from them.
- Outputs: `restart`, `stepBack`, `stepForward`. Disable restart and step back at position 0.

## When to use
Only in simulation mode, under or beside the viewport. Never reuse it for live jobs; those use MachineStatus.

## Do / Don't
- Do keep the "Simulating, nothing is sent to the machine" line visible in every state.
- Do use the primary (accent) pill only for Play/Pause; all other buttons are outlined.
- Do update the button `aria-label` together with the icon ("Play" or "Pause").
- Don't use a gradient or filled track hack; the fill is a separate `accent` bar over a `surface-sunken` track.
- Don't auto-play on entry; start paused at 1x.

## Tokens
`surface-200`, `surface-300`, `surface-sunken`, `border`, `border-strong`, `accent`, `accent-strong`, `accent-soft`, `on-accent`, `ink`, `ink-muted`, `ring`, `radius-lg`, `radius-md`, `radius-sm`, `radius-pill`, `shadow-sm`, `space-2`, `space-3`, `space-4`, `.readout`, `.code`, `.body-strong`, `.small`.

## Accessibility
- Speed is a `radiogroup` of native radios: arrow keys change the value, selection is shown by fill, border and bold text.
- Scrubber is a native `input[type=range]` with `aria-label="Simulation position"`; arrows step, Page keys jump; use `aria-valuetext` such as "03:12 of 09:48" when wiring it.
- Play/Pause has `aria-pressed`; icons are `aria-hidden`; disabled buttons use the `disabled` attribute.
- Icons: Phosphor Regular, `fill: currentColor`, 20px (16px when dense or inside chips and inputs); use the Fill weight only for active or selected states.
- Targets are at least 36px (Play/Pause 44px); thumb and track borders use `border-strong` for 3:1.
- Do not announce the time readout continuously (`aria-live="off"`).
