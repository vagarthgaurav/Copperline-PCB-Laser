import { BoardSide } from './placement.service';

/** Request and response of the Rust command `generate_gcode` (see src-tauri/src/gcode/mod.rs). */

export type GcodeDialect = 'grblHal';

export interface GcodePlacement {
  /** Board offset in mm. */
  readonly offsetX: number;
  readonly offsetY: number;
  /** Clockwise quarter turns, 0..3. */
  readonly quarterTurns: number;
}

export interface GcodeRequest {
  readonly dialect: GcodeDialect;
  readonly side: BoardSide;
  readonly placement: GcodePlacement;
  /** Laser power, 0..100 %. */
  readonly powerPercent: number;
  /** Engraving feed in mm/min. */
  readonly feedRate: number;
  /** Laser spot / line width in mm. */
  readonly spotDiameter: number;
  /** Number of isolation passes, 1..20. */
  readonly isolationPasses: number;
  /** Fraction of the spot width adjacent passes overlap, 0..0.9. */
  readonly passOverlap: number;
  /** The S value for 100 % power (grblHAL `$30`). */
  readonly spindleMax: number;
}

export interface GcodeBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface GcodeStats {
  readonly contourCount: number;
  readonly engraveLengthMm: number;
  readonly rapidLengthMm: number;
  readonly estimatedSeconds: number;
  /** Extent of the toolpath in machine coordinates. */
  readonly bounds: GcodeBounds;
}

export interface GcodeOutput {
  readonly lines: string[];
  readonly stats: GcodeStats;
  readonly warnings: string[];
}
