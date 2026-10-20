import { Service, computed, signal } from '@angular/core';

export const PANEL_WIDTHS_STORAGE_KEY = 'copperline.panel-widths';

/** Default width of both side panels, in px. */
export const PANEL_DEFAULT_WIDTH = 320;
/** Narrowest a side panel may be, in px. */
export const PANEL_MIN_WIDTH = 240;
/** Widest a side panel may be, in px. */
export const PANEL_MAX_WIDTH = 560;
/** The centre viewport never gets narrower than this, in px. */
export const CENTRE_MIN_WIDTH = 480;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitize(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? clamp(Math.round(value), PANEL_MIN_WIDTH, PANEL_MAX_WIDTH)
    : PANEL_DEFAULT_WIDTH;
}

/**
 * Widths of the left and right workspace panels, shared by Design, Simulate
 * and Machine so they stay put when switching tabs. Both are persisted.
 *
 * The user's chosen widths are kept as they are; `left` and `right` are what
 * is actually shown, which can be narrower when the window is too small to
 * leave the centre {@link CENTRE_MIN_WIDTH} px. They recover when the window
 * grows again. The layout reports the room with `setAvailable`.
 */
@Service()
export class PanelWidthService {
  private readonly initial = this.readStored();
  private readonly chosenLeft = signal(this.initial.left);
  private readonly chosenRight = signal(this.initial.right);
  private readonly available = signal<number | null>(null);

  private readonly fitted = computed(() => {
    let left = this.chosenLeft();
    let right = this.chosenRight();
    const available = this.available();
    if (available === null) {
      return { left, right };
    }
    const budget = Math.max(2 * PANEL_MIN_WIDTH, available - CENTRE_MIN_WIDTH);
    let excess = left + right - budget;
    if (excess > 0) {
      // Trim the wider panel down to the narrower one first, then both evenly.
      const cut = Math.min(excess, Math.abs(left - right));
      if (left > right) {
        left -= cut;
      } else {
        right -= cut;
      }
      excess -= cut;
      const half = Math.ceil(excess / 2);
      left -= half;
      right -= excess - half;
    }
    return { left, right };
  });

  /** Width of the left panel in px, as displayed. */
  readonly left = computed(() => this.fitted().left);
  /** Width of the right panel in px, as displayed. */
  readonly right = computed(() => this.fitted().right);

  readonly min = PANEL_MIN_WIDTH;
  readonly defaultWidth = PANEL_DEFAULT_WIDTH;

  /** Widest the left panel can currently be. */
  readonly leftMax = computed(() => this.maxFor(this.right()));
  /** Widest the right panel can currently be. */
  readonly rightMax = computed(() => this.maxFor(this.left()));

  /**
   * Width in px shared by the left panel, the centre and the right panel
   * (the layout minus padding and resize handles). Pass `null` to lift the
   * limit.
   */
  setAvailable(width: number | null): void {
    this.available.set(width !== null && Number.isFinite(width) ? Math.max(0, width) : null);
  }

  setLeft(width: number): void {
    const right = this.right();
    this.chosenLeft.set(clamp(Math.round(width), PANEL_MIN_WIDTH, this.maxFor(right)));
    this.chosenRight.set(right);
    this.persist();
  }

  setRight(width: number): void {
    const left = this.left();
    this.chosenRight.set(clamp(Math.round(width), PANEL_MIN_WIDTH, this.maxFor(left)));
    this.chosenLeft.set(left);
    this.persist();
  }

  private maxFor(otherPanel: number): number {
    const available = this.available();
    if (available === null) {
      return PANEL_MAX_WIDTH;
    }
    return clamp(available - CENTRE_MIN_WIDTH - otherPanel, PANEL_MIN_WIDTH, PANEL_MAX_WIDTH);
  }

  private persist(): void {
    try {
      localStorage.setItem(
        PANEL_WIDTHS_STORAGE_KEY,
        JSON.stringify({ left: this.chosenLeft(), right: this.chosenRight() }),
      );
    } catch {
      // Storage unavailable; the widths still apply for this session.
    }
  }

  private readStored(): { left: number; right: number } {
    try {
      const raw = localStorage.getItem(PANEL_WIDTHS_STORAGE_KEY);
      const parsed: unknown = raw === null ? null : JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        const { left, right } = parsed as Record<string, unknown>;
        return { left: sanitize(left), right: sanitize(right) };
      }
    } catch {
      // Unreadable or corrupt; fall back to the defaults.
    }
    return { left: PANEL_DEFAULT_WIDTH, right: PANEL_DEFAULT_WIDTH };
  }
}
