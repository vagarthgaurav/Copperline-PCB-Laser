import { buildBoardGeometry } from './board-geometry';
import { layer, parsedProject } from './gerber.fixtures';
import { LayerKind, ParsedProject, Primitive } from './gerber.types';

function projectWith(kind: LayerKind, primitives: Primitive[]): ParsedProject {
  const base = parsedProject();
  return {
    ...base,
    layers: base.layers.map((l) => (l.kind === kind ? { ...l, primitives } : l)),
  };
}

/** Sum of triangle areas; asserts every triangle is counter-clockwise. */
function area(tris: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < tris.length; i += 6) {
    const a =
      ((tris[i + 2] - tris[i]) * (tris[i + 5] - tris[i + 1]) -
        (tris[i + 3] - tris[i + 1]) * (tris[i + 4] - tris[i])) /
      2;
    expect(a).toBeGreaterThan(0);
    sum += a;
  }
  return sum;
}

describe('buildBoardGeometry', () => {
  it('is null without a board', () => {
    expect(buildBoardGeometry(parsedProject({ board: null }), 'top')).toBeNull();
  });

  it('reports the board bounds and an empty copper array when there is no copper', () => {
    const geo = buildBoardGeometry(parsedProject(), 'top');
    expect(geo?.bounds).toEqual({ minX: 0, minY: 0, maxX: 80, maxY: 55 });
    expect(geo?.copper.length).toBe(0);
    const noCopper = parsedProject();
    noCopper.layers = noCopper.layers.filter((l) => l.kind === 'outline');
    expect(buildBoardGeometry(noCopper, 'bottom')?.copper.length).toBe(0);
  });

  it('picks the copper layer of the requested side', () => {
    const base = parsedProject();
    const project: ParsedProject = {
      ...base,
      layers: [
        layer({
          id: 't',
          kind: 'topCopper',
          label: 'Top copper',
          primitives: [{ type: 'flash', at: [1, 1], shape: { kind: 'rect', width: 2, height: 2, rotation: 0 } }],
        }),
        layer({
          id: 'b',
          kind: 'bottomCopper',
          label: 'Bottom copper',
          primitives: [{ type: 'flash', at: [1, 1], shape: { kind: 'rect', width: 4, height: 4, rotation: 0 } }],
        }),
      ],
    };
    expect(area(buildBoardGeometry(project, 'top')!.copper)).toBeCloseTo(4, 6);
    expect(area(buildBoardGeometry(project, 'bottom')!.copper)).toBeCloseTo(16, 6);
  });

  describe('draw', () => {
    it('expands a line to a quad plus round caps', () => {
      const geo = buildBoardGeometry(
        projectWith('topCopper', [{ type: 'draw', from: [0, 0], to: [10, 0], width: 1 }]),
        'top',
      )!;
      // 10 x 1 body + a full circle of r 0.5 split over two caps, as 16-gons.
      const circle = (16 / 2) * 0.25 * Math.sin((2 * Math.PI) / 16);
      expect(area(geo.copper)).toBeCloseTo(10 + circle, 3);
      let minX = Infinity;
      let maxX = -Infinity;
      for (let i = 0; i < geo.copper.length; i += 2) {
        minX = Math.min(minX, geo.copper[i]);
        maxX = Math.max(maxX, geo.copper[i]);
      }
      expect(minX).toBeCloseTo(-0.5, 5);
      expect(maxX).toBeCloseTo(10.5, 5);
    });

    it('draws a zero-length line as a dot and ignores zero width', () => {
      const dot = buildBoardGeometry(
        projectWith('topCopper', [{ type: 'draw', from: [3, 3], to: [3, 3], width: 2 }]),
        'top',
      )!;
      expect(area(dot.copper)).toBeCloseTo((24 / 2) * Math.sin((2 * Math.PI) / 24), 4);
      const none = buildBoardGeometry(
        projectWith('topCopper', [{ type: 'draw', from: [0, 0], to: [5, 0], width: 0 }]),
        'top',
      )!;
      expect(none.copper.length).toBe(0);
    });
  });

  describe('flash', () => {
    it('triangulates a circle as a 24-gon', () => {
      const geo = buildBoardGeometry(
        projectWith('topCopper', [{ type: 'flash', at: [5, 5], shape: { kind: 'circle', diameter: 2 } }]),
        'top',
      )!;
      expect(geo.copper.length).toBe(24 * 6);
      expect(area(geo.copper)).toBeCloseTo((24 / 2) * Math.sin((2 * Math.PI) / 24), 5);
    });

    it('rotates a rect about its centre', () => {
      const geo = buildBoardGeometry(
        projectWith('topCopper', [
          { type: 'flash', at: [10, 10], shape: { kind: 'rect', width: 4, height: 2, rotation: 90 } },
        ]),
        'top',
      )!;
      expect(area(geo.copper)).toBeCloseTo(8, 6);
      const xs = Array.from(geo.copper).filter((_, i) => i % 2 === 0);
      const ys = Array.from(geo.copper).filter((_, i) => i % 2 === 1);
      expect(Math.min(...xs)).toBeCloseTo(9, 5);
      expect(Math.max(...xs)).toBeCloseTo(11, 5);
      expect(Math.min(...ys)).toBeCloseTo(8, 5);
      expect(Math.max(...ys)).toBeCloseTo(12, 5);
    });

    it('builds an obround along its longer axis', () => {
      const geo = buildBoardGeometry(
        projectWith('topCopper', [
          { type: 'flash', at: [0, 0], shape: { kind: 'obround', width: 2, height: 4, rotation: 0 } },
        ]),
        'top',
      )!;
      const ys = Array.from(geo.copper).filter((_, i) => i % 2 === 1);
      const xs = Array.from(geo.copper).filter((_, i) => i % 2 === 0);
      expect(Math.max(...ys)).toBeCloseTo(2, 5);
      expect(Math.max(...xs)).toBeCloseTo(1, 5);
      // Between a 2 x 2 square plus caps and the full 2 x 4 rectangle.
      const a = area(geo.copper);
      expect(a).toBeGreaterThan(2 * 2 + 2.9);
      expect(a).toBeLessThan(8);
    });

    it('takes polygon points relative to the flash position', () => {
      const geo = buildBoardGeometry(
        projectWith('topCopper', [
          {
            type: 'flash',
            at: [10, 20],
            shape: { kind: 'polygon', points: [[0, 0], [2, 0], [2, 2], [0, 2]] },
          },
        ]),
        'top',
      )!;
      expect(area(geo.copper)).toBeCloseTo(4, 6);
      const xs = Array.from(geo.copper).filter((_, i) => i % 2 === 0);
      expect(Math.min(...xs)).toBeCloseTo(10, 5);
      expect(Math.max(...xs)).toBeCloseTo(12, 5);
    });
  });

  describe('region', () => {
    it('triangulates a concave polygon to its exact area', () => {
      // An L shape, 3 x 3 minus a 2 x 2 corner = 5.
      const geo = buildBoardGeometry(
        projectWith('topCopper', [
          { type: 'region', points: [[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3], [0, 0]] },
        ]),
        'top',
      )!;
      expect(area(geo.copper)).toBeCloseTo(5, 6);
      expect(geo.copper.length / 6).toBe(4);
    });

    it('handles clockwise winding and a comb of reflex corners', () => {
      const comb: [number, number][] = [
        [0, 0], [9, 0], [9, 4], [8, 4], [8, 1], [7, 1], [7, 4], [6, 4], [6, 1], [5, 1],
        [5, 4], [4, 4], [4, 1], [3, 1], [3, 4], [2, 4], [2, 1], [1, 1], [1, 4], [0, 4],
      ];
      // 9 x 4 minus four 1 x 3 slots (x 1..2, 3..4, 5..6, 7..8, each y 1..4) = 36 - 12 = 24.
      const ccw = buildBoardGeometry(projectWith('topCopper', [{ type: 'region', points: comb }]), 'top')!;
      expect(area(ccw.copper)).toBeCloseTo(24, 6);
      const cw = buildBoardGeometry(
        projectWith('topCopper', [{ type: 'region', points: [...comb].reverse() }]),
        'top',
      )!;
      expect(area(cw.copper)).toBeCloseTo(24, 6);
    });

    it('survives degenerate input', () => {
      const regions: [number, number][][] = [
        [],
        [[1, 1]],
        [[0, 0], [1, 1]],
        [[0, 0], [1, 1], [2, 2], [3, 3]],
        [[0, 0], [0, 0], [0, 0], [0, 0]],
        [[0, 0], [2, 2], [2, 0], [0, 2]],
        [[0, 0], [Number.NaN, 1], [1, 1], [1, 0]],
      ];
      for (const points of regions) {
        expect(() =>
          buildBoardGeometry(projectWith('topCopper', [{ type: 'region', points }]), 'top'),
        ).not.toThrow();
      }
    });
  });

  it('ignores holes in the copper layer', () => {
    const geo = buildBoardGeometry(
      projectWith('topCopper', [{ type: 'hole', at: [1, 1], diameter: 1 }]),
      'top',
    )!;
    expect(geo.copper.length).toBe(0);
    expect(geo.holes).toEqual([]);
  });

  it('copes with a large layer', () => {
    const primitives: Primitive[] = Array.from({ length: 100_000 }, (_, i) => ({
      type: 'draw',
      from: [i % 100, Math.floor(i / 100) % 100],
      to: [(i % 100) + 0.5, Math.floor(i / 100) % 100],
      width: 0.1,
    }));
    const geo = buildBoardGeometry(projectWith('topCopper', primitives), 'top')!;
    expect(geo.copper.length).toBe(100_000 * 18 * 6);
  });

  describe('holes', () => {
    it('collects drill holes', () => {
      const geo = buildBoardGeometry(
        projectWith('drill', [
          { type: 'hole', at: [1, 2], diameter: 0.8 },
          { type: 'hole', at: [3, 4], diameter: 1 },
        ]),
        'top',
      )!;
      expect(geo.holes).toEqual([
        { x: 1, y: 2, diameter: 0.8 },
        { x: 3, y: 4, diameter: 1 },
      ]);
    });
  });

  describe('outline', () => {
    it('falls back to a rectangle of the bounds', () => {
      const geo = buildBoardGeometry(parsedProject(), 'top')!;
      expect(geo.outline).toHaveLength(1);
      expect(Array.from(geo.outline[0])).toEqual([0, 0, 80, 0, 80, 55, 0, 55, 0, 0]);
    });

    it('chains shuffled, reversed segments into a closed ring', () => {
      const geo = buildBoardGeometry(
        projectWith('outline', [
          { type: 'draw', from: [10, 10], to: [0, 10], width: 0.1 },
          { type: 'draw', from: [0, 0], to: [10, 0], width: 0.1 },
          { type: 'draw', from: [0.0004, 10], to: [0, 0.0004], width: 0.1 },
          { type: 'draw', from: [10, 0], to: [10, 10], width: 0.1 },
        ]),
        'top',
      )!;
      expect(geo.outline).toHaveLength(1);
      const ring = geo.outline[0];
      expect(ring.length).toBe(5 * 2);
      expect([ring[0], ring[1]]).toEqual([ring[8], ring[9]]);
      // Every consecutive pair is a unit-aligned side of the square.
      for (let i = 0; i < 8; i += 2) {
        expect(Math.hypot(ring[i + 2] - ring[i], ring[i + 3] - ring[i + 1])).toBeGreaterThan(9.9);
      }
    });

    it('returns separate rings and leaves open chains open', () => {
      const geo = buildBoardGeometry(
        projectWith('outline', [
          { type: 'draw', from: [0, 0], to: [1, 0], width: 0.1 },
          { type: 'draw', from: [1, 0], to: [1, 1], width: 0.1 },
          { type: 'draw', from: [1, 1], to: [0, 0], width: 0.1 },
          { type: 'draw', from: [5, 5], to: [6, 5], width: 0.1 },
          { type: 'draw', from: [7, 5], to: [6, 5], width: 0.1 },
        ]),
        'top',
      )!;
      expect(geo.outline).toHaveLength(2);
      expect(geo.outline.map((r) => r.length).sort((p, q) => p - q)).toEqual([6, 8]);
      const open = geo.outline.find((r) => r.length === 6)!;
      // Chained across the shared point, not closed: runs from one free end to the other.
      expect(Math.abs(open[0] - open[4])).toBe(2);
      const closed = geo.outline.find((r) => r.length === 8)!;
      expect([closed[0], closed[1]]).toEqual([closed[6], closed[7]]);
    });
  });
});
