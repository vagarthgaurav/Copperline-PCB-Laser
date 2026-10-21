import {
  applyAffine,
  boardTransform,
  transformedBounds,
} from '../ui/peg-board-viewport/scene-math';
import { Bounds, PegHole } from './gerber.types';

/** How far a peg hole may sit from a floor hole centre and still count as on it, mm. */
export const SNAP_TOLERANCE_MM = 0.01;

export interface PegSnapInput {
  /** `BoardGeometry.bounds`. */
  bounds: Bounds;
  pegHoles: readonly PegHole[];
  quarterTurns: number;
  mirrored: boolean;
  offsetX: number;
  offsetY: number;
  /** Floor hole pitch in mm; grid holes sit at integer multiples of it from the origin (0, 0). */
  pitch: number;
}

function round6(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  // Avoid returning -0.
  return rounded === 0 ? 0 : rounded;
}

/** Nearest offset at which every peg hole lies on a floor hole, or null when snapping is impossible. */
export function snapOffset(input: PegSnapInput): { x: number; y: number } | null {
  const { bounds, pegHoles, quarterTurns, mirrored, offsetX, offsetY, pitch } = input;
  if (pegHoles.length === 0 || !(pitch > 0)) return null;

  const first = applyAffine(
    boardTransform(bounds, offsetX, offsetY, quarterTurns, mirrored),
    pegHoles[0].x,
    pegHoles[0].y,
  );
  const x = offsetX + Math.round(first.x / pitch) * pitch - first.x;
  const y = offsetY + Math.round(first.y / pitch) * pitch - first.y;

  const snapped = boardTransform(bounds, x, y, quarterTurns, mirrored);
  for (const hole of pegHoles) {
    const p = applyAffine(snapped, hole.x, hole.y);
    const dx = p.x - Math.round(p.x / pitch) * pitch;
    const dy = p.y - Math.round(p.y / pitch) * pitch;
    if (Math.abs(dx) > SNAP_TOLERANCE_MM || Math.abs(dy) > SNAP_TOLERANCE_MM) return null;
  }
  return { x: round6(x), y: round6(y) };
}

export interface PlaceInput extends Omit<PegSnapInput, 'pegHoles' | 'pitch'> {
  /** Peg holes to snap to the floor grid; none (or no `pitch`) means a plain clamp. */
  pegHoles?: readonly PegHole[];
  pitch?: number;
  /** The rectangle that must lie fully on the floor: the blank when there is one, else `bounds`. Board frame. */
  extent: Bounds;
  /** The floor rectangle in machine mm. */
  floor: Bounds;
}

/** Slack when deciding whether a lattice position lies inside the allowed range, mm. */
const RANGE_EPSILON = 1e-6;

/**
 * The allowed offsets along one axis: the extent (relative to the offset) must
 * stay between the floor edges. Null when the extent is larger than the floor.
 */
function axisRange(floorMin: number, floorMax: number, extMin: number, extMax: number) {
  const lo = floorMin - extMin;
  const hi = floorMax - extMax;
  return lo <= hi ? { lo, hi } : null;
}

/** The lattice position `origin + k * pitch` nearest `value` inside [lo, hi], or null when none exists. */
function latticeInside(
  value: number,
  origin: number,
  pitch: number,
  lo: number,
  hi: number,
): number | null {
  const k = Math.round((value - origin) / pitch);
  let candidate = origin + k * pitch;
  if (candidate < lo - RANGE_EPSILON) {
    candidate = origin + Math.ceil((lo - origin) / pitch - RANGE_EPSILON) * pitch;
  } else if (candidate > hi + RANGE_EPSILON) {
    candidate = origin + Math.floor((hi - origin) / pitch + RANGE_EPSILON) * pitch;
  }
  return candidate >= lo - RANGE_EPSILON && candidate <= hi + RANGE_EPSILON ? candidate : null;
}

function placeAxis(
  value: number,
  range: { lo: number; hi: number } | null,
  lattice: { origin: number; pitch: number } | null,
): number {
  if (!range) return lattice ? lattice.origin : value;
  if (lattice) {
    const onLattice = latticeInside(value, lattice.origin, lattice.pitch, range.lo, range.hi);
    if (onLattice !== null) return onLattice;
  }
  return Math.min(Math.max(value, range.lo), range.hi);
}

/**
 * The offset nearest the requested one at which the extent lies fully on the
 * floor. When the holes fit the floor grid the result also keeps every peg
 * hole on a floor hole: the nearest grid position, or the nearest one inside
 * the allowed range. If an axis has no grid position inside the range, that
 * axis is clamped to the range instead (off the grid). An axis whose range is
 * empty (board larger than the floor) is not constrained.
 */
export function placeOffset(input: PlaceInput): { x: number; y: number } {
  const { bounds, extent, floor, quarterTurns, mirrored, offsetX, offsetY } = input;
  const pitch = input.pitch ?? 0;
  const snapped = snapOffset({ ...input, pegHoles: input.pegHoles ?? [], pitch });

  const box = transformedBounds(extent, boardTransform(bounds, 0, 0, quarterTurns, mirrored));
  const rangeX = axisRange(floor.minX, floor.maxX, box.minX, box.maxX);
  const rangeY = axisRange(floor.minY, floor.maxY, box.minY, box.maxY);

  const x = placeAxis(
    snapped ? snapped.x : offsetX,
    rangeX,
    snapped ? { origin: snapped.x, pitch } : null,
  );
  const y = placeAxis(
    snapped ? snapped.y : offsetY,
    rangeY,
    snapped ? { origin: snapped.y, pitch } : null,
  );
  return { x: round6(x), y: round6(y) };
}
