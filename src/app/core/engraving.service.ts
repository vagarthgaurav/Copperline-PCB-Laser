import { Service, signal } from '@angular/core';

export const DEFAULT_POWER = 65;
export const DEFAULT_FEED_RATE = 1200;

/** Laser settings shared by the pages and the G-code estimate. */
@Service()
export class EngravingService {
  private readonly _power = signal(DEFAULT_POWER);
  private readonly _feedRate = signal(DEFAULT_FEED_RATE);

  /** Laser power, 0 to 100 %. */
  readonly power = this._power.asReadonly();
  /** Engraving feed rate, in mm/min (at least 1). */
  readonly feedRate = this._feedRate.asReadonly();

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
}
