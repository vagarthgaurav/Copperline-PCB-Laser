import { Service, signal } from '@angular/core';

export type BoardSide = 'top' | 'bottom';

function round2(value: number): number {
  // Avoid -0 so bindings never show "-0".
  return Math.round(value * 100) / 100 || 0;
}

/**
 * Where the board sits on the peg-board floor and which side is being
 * engraved. Offsets are in mm from the origin; `mirror` flips the artwork
 * for the second side. Shared by Design, Simulate and Machine.
 */
@Service()
export class PlacementService {
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

  setOffset(x: number, y: number): void {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      this._offsetX.set(x);
      this._offsetY.set(y);
    }
  }

  /** Moves the board by a delta in mm, rounding the result to 0.01 mm. */
  nudge(dx: number, dy: number): void {
    if (Number.isFinite(dx) && Number.isFinite(dy)) {
      this._offsetX.set(round2(this._offsetX() + dx));
      this._offsetY.set(round2(this._offsetY() + dy));
    }
  }

  setSide(side: BoardSide): void {
    this._side.set(side);
  }

  setMirror(on: boolean): void {
    this._mirror.set(on);
  }

  /** Adds one clockwise quarter turn, wrapping from 3 back to 0. */
  rotate(): void {
    this._quarterTurns.update((turns) => (turns + 1) % 4);
  }

  /** Sets the rotation; any integer is wrapped into 0..3 (so -1 is 3). Non-integers are ignored. */
  setQuarterTurns(turns: number): void {
    if (Number.isInteger(turns)) {
      this._quarterTurns.set(((turns % 4) + 4) % 4);
    }
  }
}
