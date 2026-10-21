import {
  applyAffine,
  boardTransform,
  transformedBounds,
} from '../ui/peg-board-viewport/scene-math';
import { PegHole } from './gerber.types';
import { PegSnapInput, PlaceInput, SNAP_TOLERANCE_MM, placeOffset, snapOffset } from './peg-snap';

const BOUNDS = { minX: 126, minY: -114, maxX: 164, maxY: -76 };
const HOLES: PegHole[] = [
  { x: 125, y: -75, diameter: 2.2 },
  { x: 125, y: -115, diameter: 2.2 },
  { x: 165, y: -75, diameter: 2.2 },
  { x: 165, y: -115, diameter: 2.2 },
];
const PITCH = 10;

function input(overrides: Partial<PegSnapInput> = {}): PegSnapInput {
  return {
    bounds: BOUNDS,
    pegHoles: HOLES,
    quarterTurns: 0,
    mirrored: false,
    offsetX: 3.3,
    offsetY: 4.4,
    pitch: PITCH,
    ...overrides,
  };
}

function machineHoles(i: PegSnapInput, offset: { x: number; y: number }) {
  const m = boardTransform(i.bounds, offset.x, offset.y, i.quarterTurns, i.mirrored);
  return i.pegHoles.map((h) => applyAffine(m, h.x, h.y));
}

function distanceToGrid(v: number): number {
  return Math.abs(v - Math.round(v / PITCH) * PITCH);
}

describe('snapOffset', () => {
  it('puts the first hole where the board is placed, relative to the lower-left corner', () => {
    const i = input();
    const [first] = machineHoles(i, { x: i.offsetX, y: i.offsetY });
    expect(first.x).toBeCloseTo(2.3, 9);
    expect(first.y).toBeCloseTo(43.4, 9);
  });

  it('snaps the user template from (3.3, 4.4) to (1, 1)', () => {
    const i = input();
    const snapped = snapOffset(i);
    expect(snapped).toEqual({ x: 1, y: 1 });
    for (const p of machineHoles(i, snapped!)) {
      expect(distanceToGrid(p.x)).toBeLessThanOrEqual(SNAP_TOLERANCE_MM);
      expect(distanceToGrid(p.y)).toBeLessThanOrEqual(SNAP_TOLERANCE_MM);
    }
  });

  it('returns an already snapped offset unchanged', () => {
    expect(snapOffset(input({ offsetX: 1, offsetY: 1 }))).toEqual({ x: 1, y: 1 });
  });

  it('is idempotent', () => {
    const once = snapOffset(input())!;
    const twice = snapOffset(input({ offsetX: once.x, offsetY: once.y }));
    expect(twice).toEqual(once);
  });

  it('returns offsets rounded to 6 decimals', () => {
    const snapped = snapOffset(input({ offsetX: 3.3333333, offsetY: -7.7777777 }))!;
    expect(snapped.x).toBe(Math.round(snapped.x * 1e6) / 1e6);
    expect(snapped.y).toBe(Math.round(snapped.y * 1e6) / 1e6);
  });

  describe('every orientation', () => {
    for (const mirrored of [false, true]) {
      for (const quarterTurns of [0, 1, 2, 3]) {
        it(`lands all holes on the grid (turns ${quarterTurns}, mirrored ${mirrored})`, () => {
          const i = input({ quarterTurns, mirrored, offsetX: 37.77, offsetY: -12.34 });
          const snapped = snapOffset(i);
          expect(snapped).not.toBeNull();
          expect(Math.abs(snapped!.x - i.offsetX)).toBeLessThanOrEqual(PITCH / 2 + 1e-9);
          expect(Math.abs(snapped!.y - i.offsetY)).toBeLessThanOrEqual(PITCH / 2 + 1e-9);
          for (const p of machineHoles(i, snapped!)) {
            expect(distanceToGrid(p.x)).toBeLessThanOrEqual(SNAP_TOLERANCE_MM);
            expect(distanceToGrid(p.y)).toBeLessThanOrEqual(SNAP_TOLERANCE_MM);
          }
        });
      }
    }
  });

  describe('when snapping is impossible', () => {
    it('returns null when the hole spacing is not a whole number of pitches', () => {
      expect(snapOffset(input({ pitch: 7 }))).toBeNull();
    });

    it('returns null without peg holes', () => {
      expect(snapOffset(input({ pegHoles: [] }))).toBeNull();
    });

    it('returns null for a pitch of 0 or less', () => {
      expect(snapOffset(input({ pitch: 0 }))).toBeNull();
      expect(snapOffset(input({ pitch: -10 }))).toBeNull();
    });
  });
});

describe('placeOffset', () => {
  const BLANK = { minX: 122, minY: -118, maxX: 168, maxY: -72 };
  const FLOOR = { minX: -20, minY: -20, maxX: 480, maxY: 280 };

  function place(overrides: Partial<PlaceInput> = {}): PlaceInput {
    return {
      bounds: BOUNDS,
      extent: BLANK,
      floor: FLOOR,
      pegHoles: HOLES,
      pitch: PITCH,
      quarterTurns: 0,
      mirrored: false,
      offsetX: 1,
      offsetY: 1,
      ...overrides,
    };
  }

  function extentBox(i: PlaceInput, offset: { x: number; y: number }) {
    return transformedBounds(
      i.extent,
      boardTransform(i.bounds, offset.x, offset.y, i.quarterTurns, i.mirrored),
    );
  }

  function expectInside(i: PlaceInput, offset: { x: number; y: number }) {
    const box = extentBox(i, offset);
    const eps = 1e-6;
    expect(box.minX).toBeGreaterThanOrEqual(i.floor.minX - eps);
    expect(box.minY).toBeGreaterThanOrEqual(i.floor.minY - eps);
    expect(box.maxX).toBeLessThanOrEqual(i.floor.maxX + eps);
    expect(box.maxY).toBeLessThanOrEqual(i.floor.maxY + eps);
  }

  function expectOnGrid(i: PlaceInput, offset: { x: number; y: number }) {
    for (const p of machineHoles(i as PegSnapInput, offset)) {
      expect(distanceToGrid(p.x)).toBeLessThanOrEqual(SNAP_TOLERANCE_MM);
      expect(distanceToGrid(p.y)).toBeLessThanOrEqual(SNAP_TOLERANCE_MM);
    }
  }

  it('leaves an extent that is inside the floor where snapping puts it', () => {
    expect(placeOffset(place({ offsetX: 3.3, offsetY: 4.4 }))).toEqual({ x: 1, y: 1 });
  });

  it('puts the blank lower-left at offset + (-4, -4), so the lowest lattice offset is -9', () => {
    // Orientation 0: blank minX = 122 sits 4 mm below the cut bounds' 126, so offsetX >= -20 + 4 = -16.
    // Holes are on the grid when offsetX = 10k + 1, and the lowest such value >= -16 is -9.
    expect(placeOffset(place({ offsetX: -5000, offsetY: -5000 }))).toEqual({ x: -9, y: -9 });
    // Without snapping the same request is just clamped to -16.
    expect(placeOffset(place({ offsetX: -5000, offsetY: -5000, pegHoles: [] }))).toEqual({
      x: -16,
      y: -16,
    });
  });

  it('moves a far-away offset to the nearest lattice position inside, at each of the four edges', () => {
    // Blank spans -4..42 from the offset, so x in [-16, 438] and y in [-16, 238]; lattice is 10k + 1.
    expect(placeOffset(place({ offsetX: -9000, offsetY: 0 }))).toEqual({ x: -9, y: 1 });
    expect(placeOffset(place({ offsetX: 9000, offsetY: 0 }))).toEqual({ x: 431, y: 1 });
    expect(placeOffset(place({ offsetX: 0, offsetY: -9000 }))).toEqual({ x: 1, y: -9 });
    expect(placeOffset(place({ offsetX: 0, offsetY: 9000 }))).toEqual({ x: 1, y: 231 });
  });

  it('keeps a snapped offset that is already inside, even right at the lattice edge', () => {
    expect(placeOffset(place({ offsetX: -9, offsetY: 231 }))).toEqual({ x: -9, y: 231 });
  });

  it('keeps every orientation inside the floor and on the grid for random far-away offsets', () => {
    let seed = 12345;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (const mirrored of [false, true]) {
      for (const quarterTurns of [0, 1, 2, 3]) {
        for (let n = 0; n < 25; n++) {
          const i = place({
            quarterTurns,
            mirrored,
            offsetX: (random() - 0.5) * 4000,
            offsetY: (random() - 0.5) * 4000,
          });
          const placed = placeOffset(i);
          expectInside(i, placed);
          expectOnGrid(i, placed);
        }
      }
    }
  });

  it('only clamps when placement is free', () => {
    const i = place({ pegHoles: [], pitch: undefined, offsetX: 600.123, offsetY: 3.3 });
    expect(placeOffset(i)).toEqual({ x: 438, y: 3.3 });
    expect(placeOffset({ ...i, offsetX: -1e6, offsetY: 1e6 })).toEqual({ x: -16, y: 238 });
    expect(placeOffset({ ...i, offsetX: 12.5, offsetY: -3 })).toEqual({ x: 12.5, y: -3 });
  });

  it('uses the cut bounds as the extent when given them (no blank)', () => {
    const i = place({ extent: BOUNDS, pegHoles: [], offsetX: -5000, offsetY: 5000 });
    expect(placeOffset(i)).toEqual({ x: -20, y: 242 });
  });

  it('does not constrain an axis when the board is larger than the floor', () => {
    const tiny = { minX: 0, minY: 0, maxX: 30, maxY: 30 };
    const i = place({ floor: tiny, pegHoles: [], offsetX: -77.7, offsetY: 55.5 });
    expect(placeOffset(i)).toEqual({ x: -77.7, y: 55.5 });
    // Snapped boards stay snapped but are not pulled in.
    expect(placeOffset({ ...i, pegHoles: HOLES, offsetX: -77.7, offsetY: 55.5 })).toEqual({
      x: -79,
      y: 51,
    });
  });

  it('constrains only the axis that can be satisfied', () => {
    const narrow = { minX: 0, minY: -20, maxX: 30, maxY: 280 };
    const placed = placeOffset(
      place({ floor: narrow, pegHoles: [], offsetX: 77.7, offsetY: 9000 }),
    );
    expect(placed).toEqual({ x: 77.7, y: 238 });
  });

  it('clamps an axis when the range holds no lattice position', () => {
    // The blank is 46 mm wide and the floor 49 mm wide, a 3 mm window for the offset.
    const floor = { minX: 0, minY: -20, maxX: 49, maxY: 280 };
    // x range is [4, 7]; the lattice 10k + 1 has 1 and 11, neither inside.
    const placed = placeOffset(place({ floor, offsetX: 1, offsetY: 1 }));
    expect(placed).toEqual({ x: 4, y: 1 });
  });

  it('is idempotent', () => {
    for (const pegHoles of [HOLES, []]) {
      for (const [offsetX, offsetY] of [
        [-5000, 5000],
        [3.3333333, -7.7777777],
        [9000, 9000],
      ]) {
        const once = placeOffset(place({ pegHoles, offsetX, offsetY }));
        expect(placeOffset(place({ pegHoles, offsetX: once.x, offsetY: once.y }))).toEqual(once);
      }
    }
  });

  it('returns offsets rounded to 6 decimals and never -0', () => {
    const placed = placeOffset(place({ pegHoles: [], offsetX: 3.3333333, offsetY: -0.0000001 }));
    expect(placed.x).toBe(3.333333);
    expect(Object.is(placed.y, 0)).toBe(true);
  });
});
