# Field

A labelled form control (text, numeric with unit, select, switch, segmented, checkbox, slider) with optional help and error text.

## What you provide
- `label`: visible text (required); rendered as an uppercase `.label` above text-like controls.
- `value`: `model()` for two-way binding (string, number, boolean, or `'top' | 'bottom'` for the segmented control).
- `unit`: optional suffix such as `mm` or `mm/min` for numeric input; `min`, `max`, `step` for numeric and slider.
- `options`: list of `{ value, label }` for select and segmented.
- `help`: optional hint; `error`: optional message that switches the field to the invalid state.
- `disabled`: boolean.
- Prefer Signal Forms: bind each Field to a form field and read its validation state for `error`.

## When to use
- Every editable value: offsets, feed rate, laser power, port, side, export options.
- Switch for an immediate on/off setting ("Mirror for bottom side"); checkbox for options applied on submit.
- Segmented control for two to four mutually exclusive, always-visible choices ("Top | Bottom"); select for more.
- Slider only when the value has a bounded range and a readout beside it ("Laser power 65%").

## Do / Don't
- Do keep the unit as a suffix inside the box, and mention it in the help text or `aria-label` for screen readers.
- Do show errors as icon plus text, with the message below the control; a red border alone is not enough.
- Do right-align and set numeric values in the mono face so digits line up.
- Don't use placeholder text as the label.
- Don't use a switch for a choice that needs a Save button.

## Tokens
`--surface-300`, `--surface-200`, `--surface-sunken`, `--border-strong`, `--ink`, `--ink-muted`, `--accent`, `--on-accent`, `--danger`, `--ring`, `--radius-md`, `--radius-sm`, `--radius-pill`, `--shadow-sm`, `--space-1`, `--space-2`, `--space-3`, `--font-mono`, `--font-sans`.

## Accessibility
- Each control has a `<label for>` or `aria-labelledby`; help and error text are linked with `aria-describedby`, and invalid inputs set `aria-invalid="true"`.
- Switch: `role="switch"` with `aria-checked`; Space or Enter toggles. Segmented: `role="radiogroup"` with `role="radio"`, one tab stop, arrow keys move and select.
- Checkbox uses a native input, so Space and indeterminate work. Slider uses a native range input (arrow, Home, End, PageUp/Down) and an `<output>` for the value.
- Control borders are `--border-strong` (3:1 or better); focus is a 2px `--ring` outline with 2px offset.
- Icons: Phosphor Regular, `fill: currentColor`, 16px inside the control; the select caret and checkbox tick are decorative.
