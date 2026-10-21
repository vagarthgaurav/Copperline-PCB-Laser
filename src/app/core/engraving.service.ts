import { Service, signal } from '@angular/core';

export const DEFAULT_POWER = 65;
export const DEFAULT_FEED_RATE = 1200;
export const DEFAULT_SPOT_DIAMETER = 0.1;
export const DEFAULT_ISOLATION_PASSES = 1;
export const DEFAULT_PASS_OVERLAP = 0.3;

export const MIN_SPOT_DIAMETER = 0.01;
export const MAX_SPOT_DIAMETER = 1;
export const MIN_ISOLATION_PASSES = 1;
export const MAX_ISOLATION_PASSES = 20;
export const MAX_PASS_OVERLAP = 0.9;

/** Laser settings shared by the pages and the G-code estimate. */
@Service()
export class EngravingService {
  private readonly _power = signal(DEFAULT_POWER);
  private readonly _feedRate = signal(DEFAULT_FEED_RATE);
  private readonly _spotDiameter = signal(DEFAULT_SPOT_DIAMETER);
  private readonly _isolationPasses = signal(DEFAULT_ISOLATION_PASSES);
  private readonly _passOverlap = signal(DEFAULT_PASS_OVERLAP);

  /** Laser power, 0 to 100 %. */
  readonly power = this._power.asReadonly();
  /** Engraving feed rate, in mm/min (at least 1). */
  readonly feedRate = this._feedRate.asReadonly();
  /** Laser spot (line) width, in mm: 0.01 to 1. */
  readonly spotDiameter = this._spotDiameter.asReadonly();
  /** Number of isolation passes around each copper feature, 1 to 20. */
  readonly isolationPasses = this._isolationPasses.asReadonly();
  /** Fraction of the spot width that adjacent passes overlap, 0 to 0.9. */
  readonly passOverlap = this._passOverlap.asReadonly();

  setPower(percent: number): void {
    if (Number.isFinite(percent)) {
      this._power.set(Math.min(100, Math.max(0, percent)));
    }
  }

  setFeedRate(mmPerMin: number): void {
    if (Number.isFinite(mmPerMin)) {
      this._feedRate.set(Math.max(1, mmPerMin));
    }
  }

  setSpotDiameter(mm: number): void {
    if (Number.isFinite(mm)) {
      this._spotDiameter.set(Math.min(MAX_SPOT_DIAMETER, Math.max(MIN_SPOT_DIAMETER, mm)));
    }
  }

  /** Rounds to a whole number of passes. */
  setIsolationPasses(passes: number): void {
    if (Number.isFinite(passes)) {
      this._isolationPasses.set(
        Math.min(MAX_ISOLATION_PASSES, Math.max(MIN_ISOLATION_PASSES, Math.round(passes))),
      );
    }
  }

  setPassOverlap(fraction: number): void {
    if (Number.isFinite(fraction)) {
      this._passOverlap.set(Math.min(MAX_PASS_OVERLAP, Math.max(0, fraction)));
    }
  }
}
