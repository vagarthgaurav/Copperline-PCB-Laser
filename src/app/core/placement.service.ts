import { Service, computed, effect, inject, signal, untracked } from '@angular/core';
import { GerberService } from './gerber.service';
import { PEG_BOARD, floorBounds } from './peg-board';
import { placeOffset, snapOffset } from './peg-snap';

export type BoardSide = 'top' | 'bottom';

function round2(value: number): number {
  // Avoid -0 so bindings never show "-0".
  return Math.round(value * 100) / 100 || 0;
}

/**
 * Where the board sits on the peg-board floor and which side is being
 * engraved. Offsets are in mm from the origin; `mirror` flips the artwork
 * for the second side. Shared by Design, Simulate and Machine.
 *
 * While a board is loaded every offset is kept so the board (its blank when
 * it has one) lies fully on the floor (see `placeOffset`). When the design also
 * has peg holes whose spacing fits the floor grid, the offset is snapped so the
 * holes land on floor holes (see `snapOffset`); otherwise placement is free
 * within the floor. Without a project the offset is stored as given. The scene is mirrored by `side() === 'bottom'`;
 * the separate `mirror` flag is only a stored preference and does not draw
 * anything, so snapping follows the side.
 */
@Service()
export class PlacementService {
  private readonly gerber = inject(GerberService);
  private readonly _offsetX = signal(0);
  private readonly _offsetY = signal(0);
  private readonly _side = signal<BoardSide>('top');
  private readonly _mirror = signal(false);
  private readonly _quarterTurns = signal(0);

  /** Board offset along X, in mm. */
  readonly offsetX = this._offsetX.asReadonly();
  /** Board offset along Y, in mm. */
  readonly offsetY = this._offsetY.asReadonly();
  readonly side = this._side.asReadonly();
  readonly mirror = this._mirror.asReadonly();
  /** Clockwise quarter turns seen from above, 0..3, about the board centre. */
  readonly quarterTurns = this._quarterTurns.asReadonly();

  /** Whether the scene draws the board flipped; the viewport is bound to the same rule. */
  private readonly mirrored = computed(() => this._side() === 'bottom');

  /** Board bounds, the extent that must stay on the floor and the peg holes; null without a board. */
  private readonly source = computed(() => {
    const project = this.gerber.project();
    if (!project?.board) {
      return null;
    }
    return {
      bounds: project.board.bounds,
      extent: project.blank ?? project.board.bounds,
      pegHoles: project.pegHoles,
    };
  });

  /** The peg-grid pitch in mm while offsets snap to it, else null (free placement). */
  readonly snapPitch = computed(() =>
    this.snap(this._offsetX(), this._offsetY()) ? PEG_BOARD.holePitch : null,
  );

  constructor() {
    // A new or changed design: bring the current offset onto the floor and the grid.
    effect(() => {
      this.source();
      untracked(() => this.replace());
    });
  }

  /** The offset nearest (x, y) with every peg hole on a floor hole, or null when placement is free. */
  private snap(x: number, y: number): { x: number; y: number } | null {
    const source = this.source();
    if (!source) {
      return null;
    }
    return snapOffset({
      bounds: source.bounds,
      pegHoles: source.pegHoles,
      quarterTurns: this._quarterTurns(),
      mirrored: this.mirrored(),
      offsetX: x,
      offsetY: y,
      pitch: PEG_BOARD.holePitch,
    });
  }

  /** The offset nearest (x, y) that is on the floor (and on the grid when snapping), or null without a board. */
  private place(x: number, y: number): { x: number; y: number } | null {
    const source = this.source();
    if (!source) {
      return null;
    }
    return placeOffset({
      ...source,
      floor: floorBounds(),
      quarterTurns: this._quarterTurns(),
      mirrored: this.mirrored(),
      offsetX: x,
      offsetY: y,
      pitch: PEG_BOARD.holePitch,
    });
  }

  /** Re-places the current offset, for example after the orientation changed. */
  private replace(): void {
    const placed = this.place(this._offsetX(), this._offsetY());
    if (placed) {
      this._offsetX.set(placed.x);
      this._offsetY.set(placed.y);
    }
  }

  /** Moves the board to (x, y), or to the nearest allowed position (on the floor, on the peg grid while snapping). */
  setOffset(x: number, y: number): void {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      const placed = this.place(x, y);
      this._offsetX.set(placed ? placed.x : x);
      this._offsetY.set(placed ? placed.y : y);
    }
  }

  /** Moves the board by a delta in mm, rounding the result to 0.01 mm (or placing it on the floor and peg grid). */
  nudge(dx: number, dy: number): void {
    if (Number.isFinite(dx) && Number.isFinite(dy)) {
      const x = round2(this._offsetX() + dx);
      const y = round2(this._offsetY() + dy);
      const placed = this.place(x, y);
      this._offsetX.set(placed ? placed.x : x);
      this._offsetY.set(placed ? placed.y : y);
    }
  }

  setSide(side: BoardSide): void {
    this._side.set(side);
    this.replace();
  }

  setMirror(on: boolean): void {
    this._mirror.set(on);
    this.replace();
  }

  /** Adds one clockwise quarter turn, wrapping from 3 back to 0. */
  rotate(): void {
    this._quarterTurns.update((turns) => (turns + 1) % 4);
    this.replace();
  }

  /** Sets the rotation; any integer is wrapped into 0..3 (so -1 is 3). Non-integers are ignored. */
  setQuarterTurns(turns: number): void {
    if (Number.isInteger(turns)) {
      this._quarterTurns.set(((turns % 4) + 4) % 4);
      this.replace();
    }
  }
}
