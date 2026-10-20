# GcodeViewer

A read-only, line-numbered G-code panel that shows what has run, what is running and what is next, with an Export action and a progress footer.

## What the consumer provides
- `lines` (`input<string[]>`): the generated G-code; render a window (virtual scroll) for long programs.
- `currentLine` (`input<number>`): 1-based index of the line being executed or simulated.
- `exported` (`output<void>`): emitted by the "Export" ghost button; the parent opens the save dialog.
- The header count ("1,284 lines") and the footer ("Line 412 of 1,284 . 32%") are derived with `computed()`.

## When to use
Beside the viewport during preview, simulation and live jobs. It reflects the offset applied to the board, so lines change when the board is moved.

## Do / Don't
- Do mark the current line with three cues: `accent-soft` row, a caret in the gutter and heavier text.
- Do tone executed lines with `ink-muted` text and a `mask` gutter number, no check icons, so the list stays calm.
- Icons: Phosphor Regular, `fill: currentColor`, 20px; the current-line marker is Phosphor `caret-right` in Fill weight, 14px.
- Do keep G/M words in `accent-strong` and comments (after `;`) in `ink-muted`.
- Don't make the list editable; edits belong in settings, not in this view.
- Don't scroll the current line out of view while a job runs; follow it unless the user scrolls.

## Tokens
`surface-200`, `surface-sunken` (gutter, console-style wells), `border`, `border-strong` (button, progress bar), `ink`, `ink-muted`, `accent` (progress fill), `accent-soft`, `accent-strong`, `mask`, `ring`, `radius-lg`, `radius-md`, `radius-pill`, `space-*`, `font-mono` via `.code`, `.heading`, `.small`.

## Accessibility
- The list is an `<ol>` in a focusable scroll container (`tabindex="0"`, labelled "G-code lines"), so keyboard users can scroll with arrows and Page keys.
- The current row has `aria-current="step"`; the caret is decorative (`aria-hidden`).
- Progress bar uses `role="progressbar"` with `aria-valuenow`; the text next to it carries the same numbers.
- Export is a native `button` with a visible `border-strong` outline and the shared focus ring.
- Contrast: all text at least 4.5:1 on its row background in light and dark; the caret is at least 3:1 on `accent-soft`.
