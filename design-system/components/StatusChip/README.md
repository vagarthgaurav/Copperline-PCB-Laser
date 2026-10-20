# StatusChip

A pill that shows the machine or job state as icon plus word, with warning and error banners for messages that need more room.

## What you provide
- `status`: `'connected' | 'disconnected' | 'engraving' | 'paused' | 'fault'` (maps to colour, icon and default word).
- `label`: optional override of the word; `detail`: optional mono text such as `/dev/ttyUSB0` or `42%`.
- Banner: `severity` (`'warning' | 'error'`), a message string, and optional projected actions (a button, a dismiss icon button).
- Output: banner `dismissed`; any action button raises its own click.

## When to use
- Chip: the top bar, the Machine tab and job cards, to answer "what is the machine doing?" at a glance.
- Warning banner: the job can continue but needs attention ("Board overhangs the peg grid by 2.5 mm").
- Error banner: the job cannot continue ("Lost connection to /dev/ttyUSB0"); pair it with a recovery action.

## Do / Don't
- Do keep the word in every chip; the icon and colour only back it up.
- Do state the cause and the amount in a banner, and offer the fix as a button.
- Don't animate the chip. Engraving is shown with a static target icon, no pulsing dot.
- Don't stack more than two banners; merge or queue the rest.
- Don't use mask green for anything other than connected, done or success.

## Tokens
`--mask`, `--mask-soft`, `--accent-soft`, `--accent-strong`, `--warning`, `--warning-soft`, `--danger`, `--danger-soft`, `--surface-sunken`, `--ink`, `--ink-muted`, `--radius-pill`, `--radius-lg`, `--space-1` to `--space-4`, `--font-sans`, `--font-mono`.

## Accessibility
- Chips use `role="status"` so changes are announced politely; do not re-render the node, update its text.
- The error banner uses `role="alert"`, the warning banner `role="status"`. Banner title text states the severity in words.
- Icons are `aria-hidden`; the dismiss button needs `aria-label`.
- Icons: Phosphor Regular, `fill: currentColor`, 20px (16px when dense or inside chips and inputs); use the Fill weight only for active or selected states.
- Text on each soft background is at least 4.5:1 in both themes; banner outlines are at least 3:1 against the page.
- Buttons inside banners are focusable in reading order with the standard 2px `--ring` outline.
