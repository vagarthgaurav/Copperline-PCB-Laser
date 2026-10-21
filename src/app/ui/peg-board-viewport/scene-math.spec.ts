import {
  ELEVATION_MAX,
  ELEVATION_MIN,
  TARGET_OVERSHOOT,
  ViewCamera,
  ViewState,
  ZOOM_MAX,
  ZOOM_MIN,
  applyAffine,
  canvasToNdc,
  clampTarget,
  clipRange,
  defaultView,
  floorPointAt,
  orbitView,
  panView,
  viewBasis,
  viewPosition,
  viewRay,
  zoomView,
  zoomViewAt,
  boardTransform,
  buildDashes,
  countDone,
  extractFeed,
  fitCamera,
  grabBounds,
  holeGrid,
  pointInBoard,
  rayPlaneZ,
  stripQuads,
  transformedBounds,
} from './scene-math';
import { PathSegment } from './scene.types';

const board = { minX: 10, minY: 20, maxX: 110, maxY: 70 }; // 100 x 50

describe('boardTransform', () => {
  it('puts the lower-left corner at the offset without rotation', () => {
    const m = boardTransform(board, 5, 7, 0, false);
    const p = applyAffine(m, 10, 20);
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(7);
    expect(transformedBounds(board, m)).toEqual({ minX: 5, minY: 7, maxX: 105, maxY: 57 });
  });

  it('swaps width and height for one quarter turn, still anchored at the offset', () => {
    const box = transformedBounds(board, boardTransform(board, 5, 7, 1, false));
    expect(box.minX).toBeCloseTo(5);
    expect(box.minY).toBeCloseTo(7);
    expect(box.maxX - box.minX).toBeCloseTo(50);
    expect(box.maxY - box.minY).toBeCloseTo(100);
  });

  it('turns clockwise seen from above: the left edge ends up on top', () => {
    const m = boardTransform(board, 0, 0, 1, false);
    const upperLeft = applyAffine(m, board.minX, board.maxY);
    const lowerLeft = applyAffine(m, board.minX, board.minY);
    expect(upperLeft.x).toBeCloseTo(50); // top-left goes to top-right
    expect(upperLeft.y).toBeCloseTo(100);
    expect(lowerLeft.x).toBeCloseTo(0); // bottom-left goes to top-left
    expect(lowerLeft.y).toBeCloseTo(100);
  });

  it('is the identity placement after four quarter turns', () => {
    const m = boardTransform(board, 3, 4, 4, false);
    expect(transformedBounds(board, m)).toEqual(
      transformedBounds(board, boardTransform(board, 3, 4, 0, false)),
    );
    const p = applyAffine(m, 60, 45);
    expect(p.x).toBeCloseTo(53);
    expect(p.y).toBeCloseTo(29);
  });

  it('mirrors across the vertical centre axis', () => {
    const m = boardTransform(board, 0, 0, 0, true);
    const lowerLeft = applyAffine(m, board.minX, board.minY);
    const lowerRight = applyAffine(m, board.maxX, board.minY);
    expect(lowerLeft.x).toBeCloseTo(100);
    expect(lowerRight.x).toBeCloseTo(0);
    expect(lowerLeft.y).toBeCloseTo(0);
  });

  it('mirrors first, then rotates', () => {
    const m = boardTransform(board, 5, 7, 1, true);
    // Board lower-right (centre-relative 50,-25) -> mirror (-50,-25) -> turn (-25,50).
    // The result spans x -25..25, y -50..50, so it lands at (offset + 0, offset + 100).
    const p = applyAffine(m, board.maxX, board.minY);
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(107);
    const box = transformedBounds(board, m);
    expect(box.minX).toBeCloseTo(5);
    expect(box.minY).toBeCloseTo(7);
  });

  it('keeps a proper mirror (negative determinant) only when mirrored', () => {
    const det = (m: ReturnType<typeof boardTransform>) => m.a * m.d - m.b * m.c;
    expect(det(boardTransform(board, 0, 0, 3, false))).toBeCloseTo(1);
    expect(det(boardTransform(board, 0, 0, 3, true))).toBeCloseTo(-1);
  });

  it('wraps negative and large turn counts', () => {
    const a = boardTransform(board, 0, 0, -1, false);
    const b = boardTransform(board, 0, 0, 3, false);
    expect(a).toEqual(b);
  });
});

describe('pointInBoard', () => {
  it('tests against the placed bounds', () => {
    const m = boardTransform(board, 0, 0, 1, false); // 50 wide, 100 tall at the origin
    expect(pointInBoard(25, 90, board, m)).toBe(true);
    expect(pointInBoard(75, 25, board, m)).toBe(false);
    expect(pointInBoard(-1, 50, board, m)).toBe(false);
  });
});

describe('grabBounds', () => {
  it('is the bounds without a blank', () => {
    expect(grabBounds(board, null)).toBe(board);
  });

  it('widens to the blank, and the widened box is hit through the same transform', () => {
    const blank = { minX: 5, minY: 15, maxX: 120, maxY: 75 };
    expect(grabBounds(board, blank)).toEqual(blank);
    const m = boardTransform(board, 0, 0, 0, false);
    // Left of the cut outline but inside the blank: only the widened box catches it.
    const edge = applyAffine(m, 7, 40);
    expect(pointInBoard(edge.x, edge.y, board, m)).toBe(false);
    expect(pointInBoard(edge.x, edge.y, grabBounds(board, blank), m)).toBe(true);
  });
});

describe('fitCamera', () => {
  const floor = { minX: -20, minY: -20, maxX: 180, maxY: 130 };
  const points = [floor.minX, floor.maxX].flatMap((x) =>
    [floor.minY, floor.maxY].flatMap((y) => [-6, 0].map((z) => ({ x, y, z }))),
  );
  const target = { x: 80, y: 55, z: 0 };

  /** Projects a point with the same view as the fit and returns its NDC extent. */
  function ndc(
    p: { x: number; y: number; z: number },
    fit: ReturnType<typeof fitCamera>,
    fovDeg: number,
    aspect: number,
  ) {
    const f = {
      x: target.x - fit.position.x,
      y: target.y - fit.position.y,
      z: target.z - fit.position.z,
    };
    const fl = Math.hypot(f.x, f.y, f.z);
    f.x /= fl;
    f.y /= fl;
    f.z /= fl;
    // right = f x up(0,0,1), up = right x f
    const rl = Math.hypot(f.y, f.x);
    const r = { x: f.y / rl, y: -f.x / rl, z: 0 };
    const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
    const rel = { x: p.x - fit.position.x, y: p.y - fit.position.y, z: p.z - fit.position.z };
    const depth = rel.x * f.x + rel.y * f.y + rel.z * f.z;
    const tanV = Math.tan((fovDeg * Math.PI) / 360);
    return {
      x: (rel.x * r.x + rel.y * r.y + rel.z * r.z) / (depth * tanV * aspect),
      y: (rel.x * u.x + rel.y * u.y + rel.z * u.z) / (depth * tanV),
    };
  }

  for (const aspect of [0.6, 1.5, 3]) {
    it(`touches the margin exactly on the limiting axis at aspect ${aspect}`, () => {
      const input = {
        points,
        target,
        elevationDeg: 45,
        yawDeg: 20,
        fovDeg: 30,
        aspect,
        margin: 0.05,
      };
      const fit = fitCamera(input);
      const extents = points.map((p) => ndc(p, fit, 30, aspect));
      const worst = Math.max(...extents.flatMap((e) => [Math.abs(e.x), Math.abs(e.y)]));
      expect(worst).toBeCloseTo(1 / 1.05, 6);
    });
  }

  it('moves back when the view narrows', () => {
    const base = { points, target, elevationDeg: 45, yawDeg: 0, fovDeg: 30, margin: 0.05 };
    expect(fitCamera({ ...base, aspect: 0.5 }).distance).toBeGreaterThan(
      fitCamera({ ...base, aspect: 2 }).distance,
    );
  });

  it('puts the camera in front of and above the target', () => {
    const fit = fitCamera({
      points,
      target,
      elevationDeg: 45,
      yawDeg: 0,
      fovDeg: 30,
      aspect: 1.5,
      margin: 0.05,
    });
    expect(fit.position.x).toBeCloseTo(target.x);
    expect(fit.position.y).toBeLessThan(target.y);
    expect(fit.position.z).toBeGreaterThan(0);
    expect(fit.position.z).toBeCloseTo(target.y - fit.position.y, 6); // 45 degrees
  });
});

describe('rayPlaneZ', () => {
  it('finds the intersection with the plane', () => {
    const hit = rayPlaneZ({ x: 0, y: -10, z: 10 }, { x: 0, y: 1, z: -1 }, 0);
    expect(hit?.x).toBeCloseTo(0);
    expect(hit?.y).toBeCloseTo(0);
    const raised = rayPlaneZ({ x: 0, y: -10, z: 10 }, { x: 0, y: 1, z: -1 }, 1.6);
    expect(raised?.y).toBeCloseTo(-1.6);
  });

  it('misses rays that point up or run parallel', () => {
    expect(rayPlaneZ({ x: 0, y: 0, z: 10 }, { x: 0, y: 1, z: 1 }, 0)).toBeNull();
    expect(rayPlaneZ({ x: 0, y: 0, z: 10 }, { x: 0, y: 1, z: 0 }, 0)).toBeNull();
  });
});

describe('holeGrid', () => {
  it('lays holes on the pitch, fully inside the floor, including the origin', () => {
    const grid = holeGrid({ minX: -20, minY: -20, maxX: 180, maxY: 130 }, 10, 3);
    expect(grid.length / 2).toBe(19 * 14);
    const origin = Array.from({ length: grid.length / 2 }, (_, i) => [
      grid[i * 2],
      grid[i * 2 + 1],
    ]).some(([x, y]) => x === 0 && y === 0);
    expect(origin).toBe(true);
  });
});

describe('feed moves', () => {
  const path: PathSegment[] = [
    { line: 2, kind: 'rapid', x1: 0, y1: 0, x2: 5, y2: 0 },
    { line: 3, kind: 'feed', x1: 5, y1: 0, x2: 10, y2: 0 },
    { line: 4, kind: 'feed', x1: 10, y1: 0, x2: 10, y2: 5 },
    { line: 7, kind: 'rapid', x1: 10, y1: 5, x2: 0, y2: 5 },
    { line: 9, kind: 'feed', x1: 0, y1: 5, x2: 0, y2: 8 },
  ];

  it('drops rapids and keeps order', () => {
    const feed = extractFeed(path);
    expect(Array.from(feed.lines)).toEqual([3, 4, 9]);
    expect(Array.from(feed.coords.slice(0, 4))).toEqual([5, 0, 10, 0]);
  });

  it('counts the moves done up to a line', () => {
    const { lines } = extractFeed(path);
    expect(countDone(lines, 0)).toBe(0);
    expect(countDone(lines, 3)).toBe(1);
    expect(countDone(lines, 8)).toBe(2);
    expect(countDone(lines, 9)).toBe(3);
    expect(countDone(lines, 1000)).toBe(3);
    expect(countDone(new Int32Array(0), 5)).toBe(0);
  });
});

describe('stripQuads', () => {
  it('builds one 6-vertex quad per segment with the requested width', () => {
    const quads = stripQuads(new Float32Array([0, 0, 10, 0, 0, 0, 0, 0]), 0.4);
    expect(quads.length).toBe(2 * 6 * 3);
    const ys = [1, 4, 7, 10, 13, 16].map((i) => quads[i]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.4);
    const xs = [0, 3, 6, 9, 12, 15].map((i) => quads[i]);
    expect(Math.min(...xs)).toBeCloseTo(0);
    expect(Math.max(...xs)).toBeCloseTo(10);
    // The zero-length segment is degenerate (all zeros).
    expect(Array.from(quads.slice(18)).every((v) => v === 0)).toBe(true);
  });

  it('extends both ends', () => {
    const quads = stripQuads(new Float32Array([0, 0, 10, 0]), 0.4, 0.2);
    const xs = [0, 3, 6, 9, 12, 15].map((i) => quads[i]);
    expect(Math.min(...xs)).toBeCloseTo(-0.2);
    expect(Math.max(...xs)).toBeCloseTo(10.2);
  });

  it('winds counter-clockwise seen from +Z', () => {
    const q = stripQuads(new Float32Array([0, 0, 10, 0]), 1);
    const [ax, ay, bx, by, cx, cy] = [q[0], q[1], q[3], q[4], q[6], q[7]];
    expect((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)).toBeGreaterThan(0);
  });
});

describe('buildDashes', () => {
  it('splits a move into dashes and records where each move starts', () => {
    const coords = new Float32Array([0, 0, 10, 0, 0, 5, 0, 5, 0, 0, 0, 3]);
    const dashes = buildDashes(coords, 1, 1, 100);
    expect(dashes).not.toBeNull();
    // 10 mm at a 2 mm period -> 5 dashes; zero-length -> 0; 3 mm -> 2 dashes (the last is 1 mm).
    expect(Array.from(dashes!.firstDash)).toEqual([0, 5, 5, 7]);
    expect(Array.from(dashes!.coords.slice(0, 8))).toEqual([0, 0, 1, 0, 2, 0, 3, 0]);
    expect(Array.from(dashes!.coords.slice(5 * 4, 6 * 4))).toEqual([0, 0, 0, 1]);
  });

  it('clips the last dash to the end of the move', () => {
    const dashes = buildDashes(new Float32Array([0, 0, 2.5, 0]), 2, 1, 100)!;
    expect(Array.from(dashes.coords)).toEqual([0, 0, 2, 0]);
    const short = buildDashes(new Float32Array([0, 0, 0.5, 0]), 2, 1, 100)!;
    expect(Array.from(short.coords)).toEqual([0, 0, 0.5, 0]);
  });

  it('gives up when the dash count would exceed the cap', () => {
    expect(buildDashes(new Float32Array([0, 0, 1000, 0]), 1, 1, 100)).toBeNull();
  });
});

describe('camera navigation', () => {
  const floor = { minX: -20, minY: -20, maxX: 180, maxY: 130 };
  const camera: ViewCamera = { fitDistance: 420, fovDeg: 30, aspect: 1.6 };
  const centre = { x: 80, y: 55 };
  /** Wide lens at the lowest tilt: the top edge of the screen looks above the horizon. */
  const wide: ViewCamera = { ...camera, fovDeg: 60 };
  const low: ViewState = { ...defaultView(floor), elevationDeg: ELEVATION_MIN };
  const sky = { x: 0, y: 1 };

  /** Projects a floor-plane point to NDC through the view, independent of `viewRay`. */
  function project(view: ViewState, point: { x: number; y: number; z?: number }) {
    const { forward, right, up } = viewBasis(view.elevationDeg, view.azimuthDeg);
    const eye = viewPosition(view, camera.fitDistance);
    const rel = { x: point.x - eye.x, y: point.y - eye.y, z: (point.z ?? 0) - eye.z };
    const dot = (v: { x: number; y: number; z: number }) => rel.x * v.x + rel.y * v.y + rel.z * v.z;
    const tanV = Math.tan((camera.fovDeg * Math.PI) / 360);
    const depth = dot(forward);
    return { x: dot(right) / (depth * tanV * camera.aspect), y: dot(up) / (depth * tanV) };
  }

  describe('defaultView', () => {
    it('looks at the floor centre at 45 degrees, no yaw, zoom 1', () => {
      expect(defaultView(floor)).toEqual({
        azimuthDeg: 0,
        elevationDeg: 45,
        zoom: 1,
        target: centre,
      });
    });
  });

  describe('orbitView', () => {
    it('adds the deltas and leaves the target and zoom alone', () => {
      const view = { ...defaultView(floor), zoom: 2 };
      expect(orbitView(view, 30, 10)).toEqual({ ...view, azimuthDeg: 30, elevationDeg: 55 });
    });

    it('clamps elevation to 15..89 but not azimuth', () => {
      const view = defaultView(floor);
      expect(orbitView(view, 720, 100).elevationDeg).toBe(ELEVATION_MAX);
      expect(orbitView(view, -720, -100).elevationDeg).toBe(ELEVATION_MIN);
      expect(orbitView(view, 720, 0).azimuthDeg).toBe(720);
      expect([ELEVATION_MIN, ELEVATION_MAX]).toEqual([15, 89]);
    });

    it('ignores non-finite deltas', () => {
      const view = defaultView(floor);
      expect(orbitView(view, NaN, Infinity)).toEqual(view);
    });
  });

  describe('zoomView', () => {
    it('multiplies and clamps to 0.5..8', () => {
      const view = defaultView(floor);
      expect(zoomView(view, 2).zoom).toBe(2);
      expect(zoomView(zoomView(view, 2), 2).zoom).toBe(4);
      expect(zoomView(view, 100).zoom).toBe(ZOOM_MAX);
      expect(zoomView(view, 0.001).zoom).toBe(ZOOM_MIN);
      expect([ZOOM_MIN, ZOOM_MAX]).toEqual([0.5, 8]);
    });

    it('ignores factors that are not positive numbers', () => {
      const view = defaultView(floor);
      for (const factor of [0, -1, NaN, Infinity]) expect(zoomView(view, factor)).toBe(view);
    });
  });

  describe('clampTarget', () => {
    it('lets the target roam the floor expanded by 20% on each side', () => {
      const w = floor.maxX - floor.minX;
      const h = floor.maxY - floor.minY;
      expect(clampTarget({ x: 1000, y: 1000 }, floor)).toEqual({
        x: floor.maxX + w * TARGET_OVERSHOOT,
        y: floor.maxY + h * TARGET_OVERSHOOT,
      });
      expect(clampTarget({ x: -1000, y: -1000 }, floor)).toEqual({
        x: floor.minX - w * TARGET_OVERSHOOT,
        y: floor.minY - h * TARGET_OVERSHOOT,
      });
      expect(clampTarget({ x: 50, y: 60 }, floor)).toEqual({ x: 50, y: 60 });
    });
  });

  describe('canvasToNdc', () => {
    it('maps the canvas corners and centre', () => {
      expect(canvasToNdc(0, 0, 800, 400)).toEqual({ x: -1, y: 1 });
      expect(canvasToNdc(800, 400, 800, 400)).toEqual({ x: 1, y: -1 });
      expect(canvasToNdc(400, 200, 800, 400)).toEqual({ x: 0, y: 0 });
    });
  });

  describe('floorPointAt under any view', () => {
    const views: ViewState[] = [
      defaultView(floor),
      { azimuthDeg: 37, elevationDeg: 30, zoom: 1.5, target: { x: 60, y: 40 } },
      { azimuthDeg: -120, elevationDeg: 15, zoom: 0.5, target: centre },
      { azimuthDeg: 200, elevationDeg: 89, zoom: 8, target: { x: 150, y: 100 } },
    ];

    it('hits the target at the screen centre', () => {
      for (const view of views) {
        const hit = floorPointAt(view, camera, { x: 0, y: 0 })!;
        expect(hit.x).toBeCloseTo(view.target.x, 6);
        expect(hit.y).toBeCloseTo(view.target.y, 6);
      }
    });

    it('inverts the projection of a floor point', () => {
      for (const view of views) {
        const point = { x: view.target.x + 12, y: view.target.y - 9 };
        const hit = floorPointAt(view, camera, project(view, point))!;
        expect(hit.x).toBeCloseTo(point.x, 6);
        expect(hit.y).toBeCloseTo(point.y, 6);
      }
    });

    it('casts rays from the camera position, unit length', () => {
      const view = views[1];
      const { origin, direction } = viewRay(view, camera, { x: 0.3, y: -0.2 });
      expect(origin).toEqual(viewPosition(view, camera.fitDistance));
      expect(Math.hypot(direction.x, direction.y, direction.z)).toBeCloseTo(1, 10);
    });

    it('swings the camera toward +X with positive azimuth and puts it over the floor', () => {
      const view = orbitView(defaultView(floor), 90, 0);
      const eye = viewPosition(view, camera.fitDistance);
      expect(eye.x).toBeGreaterThan(centre.x);
      expect(eye.y).toBeCloseTo(centre.y, 6);
      expect(eye.z).toBeGreaterThan(0);
    });

    it('misses the floor above the horizon', () => {
      expect(floorPointAt(low, wide, sky)).toBeNull();
    });
  });

  describe('panView', () => {
    it('puts the floor point from the start pixel under the end pixel', () => {
      const view: ViewState = {
        azimuthDeg: 50,
        elevationDeg: 35,
        zoom: 1.2,
        target: { x: 70, y: 50 },
      };
      const from = { x: -0.2, y: -0.3 };
      const to = { x: 0.25, y: -0.1 };
      const grabbed = floorPointAt(view, camera, from)!;
      const next = panView(view, camera, from, to, floor);
      const under = floorPointAt(next, camera, to)!;
      expect(under.x).toBeCloseTo(grabbed.x, 6);
      expect(under.y).toBeCloseTo(grabbed.y, 6);
      expect(next.target).not.toEqual(view.target);
      expect({ ...next, target: view.target }).toEqual(view);
    });

    it('does not move for a zero drag', () => {
      const view = defaultView(floor);
      const next = panView(view, camera, { x: 0.1, y: -0.2 }, { x: 0.1, y: -0.2 }, floor);
      expect(next.target.x).toBeCloseTo(view.target.x, 9);
      expect(next.target.y).toBeCloseTo(view.target.y, 9);
    });

    it('clamps the target to the expanded floor', () => {
      const view = defaultView(floor);
      const next = panView(view, camera, { x: 0.9, y: -0.9 }, { x: -0.9, y: -0.1 }, floor);
      const limit = clampTarget({ x: 1e6, y: 1e6 }, floor);
      for (let i = 0, v = next; i < 200; i++) {
        v = panView(v, camera, { x: 0.9, y: -0.9 }, { x: -0.9, y: -0.1 }, floor);
        expect(v.target.x).toBeLessThanOrEqual(limit.x);
        expect(v.target.y).toBeLessThanOrEqual(limit.y);
        if (i === 199) expect(v.target.x).toBeCloseTo(limit.x, 6);
      }
    });

    it('is a no-op when either ray misses the floor', () => {
      expect(panView(low, wide, { x: 0, y: 0 }, sky, floor)).toBe(low);
      expect(panView(low, wide, sky, { x: 0, y: 0 }, floor)).toBe(low);
    });
  });

  describe('zoomViewAt', () => {
    const view: ViewState = {
      azimuthDeg: -25,
      elevationDeg: 40,
      zoom: 1,
      target: { x: 70, y: 45 },
    };

    it('keeps the floor point under the cursor in place', () => {
      const at = { x: 0.5, y: -0.4 };
      const before = floorPointAt(view, camera, at)!;
      for (const factor of [1.25, 2, 0.8]) {
        const next = zoomViewAt(view, camera, factor, at, floor);
        expect(next.zoom).toBeCloseTo(factor, 9);
        const after = floorPointAt(next, camera, at)!;
        expect(after.x).toBeCloseTo(before.x, 6);
        expect(after.y).toBeCloseTo(before.y, 6);
      }
    });

    it('zooms about the target when no point is given', () => {
      const next = zoomViewAt(view, camera, 2, null, floor);
      expect(next).toEqual({ ...view, zoom: 2 });
    });

    it('falls back to a plain zoom when the cursor ray misses the floor', () => {
      expect(zoomViewAt(low, wide, 2, sky, floor)).toEqual({ ...low, zoom: 2 });
    });

    it('leaves the target alone when the zoom is already at its limit', () => {
      const closest = { ...view, zoom: ZOOM_MAX };
      expect(zoomViewAt(closest, camera, 2, { x: 0.5, y: -0.4 }, floor)).toEqual(closest);
    });

    it('zooms in over the screen centre without drifting', () => {
      const next = zoomViewAt(view, camera, 3, { x: 0, y: 0 }, floor);
      expect(next.target.x).toBeCloseTo(view.target.x, 6);
      expect(next.target.y).toBeCloseTo(view.target.y, 6);
    });
  });

  describe('clipRange', () => {
    const points = [floor.minX, floor.maxX].flatMap((x) =>
      [floor.minY, floor.maxY].flatMap((y) => [-6, 20].map((z) => ({ x, y, z }))),
    );
    const depthOf = (view: ViewState, p: { x: number; y: number; z: number }) => {
      const { forward } = viewBasis(view.elevationDeg, view.azimuthDeg);
      const eye = viewPosition(view, camera.fitDistance);
      return (p.x - eye.x) * forward.x + (p.y - eye.y) * forward.y + (p.z - eye.z) * forward.z;
    };

    it('brackets every scene point at every tilt when the camera is outside the scene', () => {
      for (const elevationDeg of [15, 45, 89]) {
        for (const azimuthDeg of [0, 90, 210]) {
          const view = { ...defaultView(floor), elevationDeg, azimuthDeg };
          const { near, far } = clipRange(view, camera, points);
          expect(near).toBeGreaterThan(0);
          for (const p of points) {
            expect(depthOf(view, p)).toBeGreaterThanOrEqual(near);
            expect(depthOf(view, p)).toBeLessThanOrEqual(far);
          }
        }
      }
    });

    it('keeps a positive near and a far beyond all points at the zoom limits', () => {
      for (const zoom of [ZOOM_MIN, 1, ZOOM_MAX]) {
        const view = { ...defaultView(floor), zoom };
        const { near, far } = clipRange(view, camera, points);
        expect(near).toBeGreaterThan(0);
        expect(far).toBeGreaterThan(near);
        for (const p of points) expect(depthOf(view, p)).toBeLessThanOrEqual(far);
      }
    });
  });
});
