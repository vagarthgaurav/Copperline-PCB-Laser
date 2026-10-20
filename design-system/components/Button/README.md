# Button

A single-action control in four variants (primary, secondary, ghost, danger) and two sizes (md 36px, sm 32px).

## What you provide
- `variant`: `'primary' | 'secondary' | 'ghost' | 'danger'` (default `secondary`).
- `size`: `'md' | 'sm'` (default `md`).
- `disabled`: boolean, set on the native `<button>`.
- Content: a text label, optionally one leading 20px icon. Icon-only buttons are square (36 or 32px) and need an `aria-label`.
- Output: the native `click` (in Angular, a `clicked` output or a plain `(click)` on the host).

## When to use
- Primary: the one main action of a view ("Export G-code", "Connect"). At most one per region.
- Secondary: other actions ("Flip to bottom", "Open Gerber…").
- Ghost: toolbars, panel headers and low-emphasis actions; icon-only buttons are usually ghost.
- Danger: stopping or destroying ("Emergency stop"). Always keep the word or icon, never colour alone.

## Do / Don't
- Do use verb-first labels, with an ellipsis when a dialog follows ("Open Gerber…").
- Do keep disabled buttons visible and explain why in nearby help text.
- Don't put two primary buttons side by side.
- Don't use a ghost button for the only way to finish a task.
- Don't shrink below 32px height, even in dense panels.

## Tokens
`--accent`, `--accent-strong`, `--accent-soft`, `--on-accent`, `--surface-300`, `--surface-sunken`, `--border-strong`, `--ink`, `--ink-muted`, `--danger`, `--danger-soft`, `--ring`, `--radius-md`, `--shadow-sm`, `--space-1`, `--space-2`, `--space-3`, `--space-4`, `--font-sans`.

## Accessibility
- Use a real `<button type="button">`; Enter and Space activate it, Tab reaches it.
- Focus ring: `outline: 2px solid var(--ring); outline-offset: 2px` on `:focus-visible`.
- Icons are `aria-hidden="true"`; the accessible name is the text or `aria-label`.
- Icons: Phosphor Regular, `fill: currentColor`, 20px (16px when dense or inside chips and inputs); use the Fill weight only for active or selected states.
- Use the `disabled` attribute (removes it from the tab order); the primary disabled style is a muted fill, not a faded accent.
- Text on every variant is at least 4.5:1 in light and dark; the secondary and danger borders are at least 3:1.
