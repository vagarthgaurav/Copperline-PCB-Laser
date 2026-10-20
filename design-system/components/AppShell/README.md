# AppShell

The application frame: a top bar with app name, tabs, theme toggle and export, plus a layer panel, a central 3D viewport well and a narrow placement readout.

## What you provide
- `tab`: `model<'design' | 'simulate' | 'machine'>()` for the active workspace.
- `theme`: `model<'light' | 'dark'>()`; the shell writes it to `document.documentElement.dataset.theme`.
- Projected content slots: `[left]` (layer list and form), default slot (the viewport canvas) and `[right]` (placement readout).
- Output: `exportRequested` from the primary "Export G-code" button.
- The shell owns layout only; panels bring their own content and state.

## When to use
- Once, as the root layout of the app. Design, Simulate and Machine all share it; only the tab and panel content change.
- Keep the left panel for per-layer and per-board settings, the right panel for live readouts.

## Do / Don't
- Do keep the app name in the display face and everything else in the sans face; use mono only for coordinates and file names.
- Do separate panels with `--space-4` gaps, `--radius-lg` and a 1px `--border` hairline.
- Do let the viewport take all spare width; panels have fixed widths (240px and 180px).
- Don't add a second primary button to the top bar.
- Don't put the active-tab marker in any colour other than `--accent`, and don't rely on it alone: the active tab text is also `--ink`.

## Tokens
`--surface-100`, `--surface-200`, `--surface-sunken`, `--border`, `--border-strong`, `--accent`, `--accent-soft`, `--ink`, `--ink-muted`, `--ring`, `--radius-lg`, `--radius-md`, `--radius-pill`, `--space-1` to `--space-8`, `--font-display`, `--font-sans`, `--font-mono`, and the `.heading`, `.label` and `.readout` type styles.

## Accessibility
- Landmarks: `<header>`, two `<aside>` with `aria-label`, and `<main>` for the viewport.
- Tabs use `role="tablist"`/`role="tab"` with `aria-selected`, one tab stop, and arrow keys move between tabs.
- The theme toggle is a button whose `aria-label` names the action ("Switch to dark theme") and updates after each toggle.
- Selected layer uses `aria-current="true"` plus a 1px accent border, not colour fill alone.
- The viewport canvas needs a text alternative or a keyboard route to move the board (arrow keys nudge by 0.1 mm).
- Icons: Phosphor Regular, `fill: currentColor`, 20px; the theme toggle swaps Phosphor `sun` and `moon`.
