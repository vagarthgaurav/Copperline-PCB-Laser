# MachineStatus

A card for the live laser machine: serial port and connection state, XYZ position, job progress, run controls and a mini console.

## What the consumer provides
- `ports` (`input<string[]>`) and `port` (`model<string>`): items like "/dev/ttyUSB0 . 115200".
- `connection` (`input<'disconnected' | 'connected'>`): drives the chip, the Connect/Disconnect button and enabled controls.
- `position` (`input<{x: number, y: number, z: number}>`), `job` (`input<{name: string, side: 'Top' | 'Bottom', line: number, lines: number, etaSeconds: number} | null>`).
- `consoleLines` (`input<string[]>`): last four lines of GRBL output.
- Outputs: `connect`, `disconnect`, `start`, `pause`, `stop`, `home`.

## When to use
In the machine side panel during a live job. It is the only place that sends commands; simulation uses SimulationControls.

## Do / Don't
- Do pair the status colour with a word and an icon ("Connected" with a check, "Disconnected" with a cross).
- Do keep Stop outlined in `danger` with a label; it must stay reachable while a job runs.
- Do disable Start while a job is running and everything but Connect while disconnected.
- Don't show a position when disconnected; show an em dash instead of stale numbers.
- Don't use the colour of the progress bar to carry state; the text line has the numbers.

## Tokens
`surface-200`, `surface-300`, `surface-sunken`, `border`, `border-strong`, `accent`, `accent-strong`, `accent-soft`, `on-accent`, `mask`, `mask-soft`, `danger`, `danger-soft`, `ink`, `ink-muted`, `ring`, `radius-lg`, `radius-md`, `radius-pill`, `shadow-sm`, `space-*`, `.readout`, `.label`, `.code`, `.body-strong`.

## Accessibility
- Port select has a visible `<label>`; chip is `role="status"` so connect/disconnect is announced politely.
- Position cells are a labelled group; "mm" is a visible unit, not the only cue.
- Progress bar: `role="progressbar"`, `aria-valuemin/max/now` and an accessible name; the text row repeats line and ETA.
- Console is `role="log"` (polite); do not move focus into it on new lines.
- All buttons are at least 36px, with the shared 2px `ring` focus style; icons are decorative.
- Icons: Phosphor Regular, `fill: currentColor`, 20px (16px when dense or inside chips and inputs); use the Fill weight only for active or selected states.
