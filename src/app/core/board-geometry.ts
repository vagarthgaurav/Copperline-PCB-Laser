import { Bounds, FlashShape, ParsedLayer, ParsedProject, Point, Primitive } from './gerber.types';
import { BoardGeometry } from '../ui/peg-board-viewport/scene.types';

/** Segments per half circle on round line caps and obround ends. */
const CAP_SEGMENTS = 8;
/** Sides of a circular flash. */
const CIRCLE_SEGMENTS = 24;
/** Outline endpoints closer than this (mm) are the same point. */
const JOIN_TOLERANCE = 1e-3;
/** Cross products at or below this are treated as collinear when ear clipping. */
const COLLINEAR_EPS = 1e-12;

const CAP_COS: readonly number[] = Array.from({ length: CAP_SEGMENTS + 1 }, (_, k) =>
  Math.cos((k * Math.PI) / CAP_SEGMENTS),
);
const CAP_SIN: readonly number[] = Array.from({ length: CAP_SEGMENTS + 1 }, (_, k) =>
  Math.sin((k * Math.PI) / CAP_SEGMENTS),
);
const CIRCLE_COS: readonly number[] = Array.from({ length: CIRCLE_SEGMENTS }, (_, k) =>
  Math.cos((k * 2 * Math.PI) / CIRCLE_SEGMENTS),
);
const CIRCLE_SIN: readonly number[] = Array.from({ length: CIRCLE_SEGMENTS }, (_, k) =>
  Math.sin((k * 2 * Math.PI) / CIRCLE_SEGMENTS),
);

/**
 * Triangulates the copper of one board side and collects the outline rings and
 * drill holes. Null when the project has no board. Pure and framework free.
 *
 * Coordinates stay in board space (mm, +Y up). Conventions, matching the Rust
 * parser (`src-tauri/src/gerber`):
 * - polygon flash points are RELATIVE to the flash `at` (aperture origin), as
 *   produced by aperture macros and the `P` aperture, so `at` is added here;
 * - region points are absolute;
 * - rect / obround `rotation` is in degrees, counter-clockwise, about `at`;
 *   an obround's round ends lie on its longer axis.
 *
 * Triangles are emitted counter-clockwise. Outline rings that close repeat their
 * first point as the last one (so they work as both line loops and line strips);
 * open chains are returned as they were chained.
 */
export function buildBoardGeometry(
  project: ParsedProject,
  side: 'top' | 'bottom',
): BoardGeometry | null {
  const board = project.board;
  if (board === null) {
    return null;
  }
  const bounds = board.bounds;
  const copperKind = side === 'top' ? 'topCopper' : 'bottomCopper';

  const buffer = new TriangleBuffer();
  const outlineSegments: Point[][] = [];
  const holes: BoardGeometry['holes'] = [];

  for (const layer of project.layers) {
    if (layer.kind === copperKind) {
      triangulateCopper(layer, buffer);
    } else if (layer.kind === 'outline') {
      collectOutlineDraws(layer, outlineSegments);
    } else if (layer.kind === 'drill') {
      for (const p of layer.primitives) {
        if (p.type === 'hole') {
          holes.push({ x: p.at[0], y: p.at[1], diameter: p.diameter });
        }
      }
    }
  }

  let outline = chainRings(outlineSegments);
  if (outline.length === 0) {
    outline = [boundsRing(bounds)];
  }
  return { bounds, copper: buffer.finish(), outline, holes };
}

// ---------------------------------------------------------------------------
// Copper

/** Growable flat x,y vertex store; no per-triangle allocation. */
class TriangleBuffer {
  private data = new Float32Array(8192);
  private length = 0;

  /** Appends one triangle, flipping it when needed so it is counter-clockwise. */
  tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): void {
    if (
      !Number.isFinite(ax + ay + bx + by + cx + cy) ||
      (bx - ax) * (cy - ay) - (by - ay) * (cx - ax) === 0
    ) {
      return;
    }
    if (this.length + 6 > this.data.length) {
      const grown = new Float32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    const d = this.data;
    const flip = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax) < 0;
    d[this.length++] = ax;
    d[this.length++] = ay;
    d[this.length++] = flip ? cx : bx;
    d[this.length++] = flip ? cy : by;
    d[this.length++] = flip ? bx : cx;
    d[this.length++] = flip ? by : cy;
  }

  finish(): Float32Array {
    return this.data.slice(0, this.length);
  }
}

function triangulateCopper(layer: ParsedLayer, out: TriangleBuffer): void {
  for (const p of layer.primitives) {
    addPrimitive(p, out);
  }
}

function addPrimitive(p: Primitive, out: TriangleBuffer): void {
  switch (p.type) {
    case 'draw':
      addCapsule(out, p.from[0], p.from[1], p.to[0], p.to[1], p.width / 2);
      break;
    case 'flash':
      addFlash(out, p.at, p.shape);
      break;
    case 'region':
      addPolygon(out, p.points, 0, 0);
      break;
    case 'hole':
      break;
  }
}

function addFlash(out: TriangleBuffer, at: Point, shape: FlashShape): void {
  const [ax, ay] = at;
  switch (shape.kind) {
    case 'circle':
      addCircle(out, ax, ay, shape.diameter / 2);
      break;
    case 'rect': {
      const hw = shape.width / 2;
      const hh = shape.height / 2;
      const rad = (shape.rotation * Math.PI) / 180;
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      const corner = (px: number, py: number): [number, number] => [
        ax + px * c - py * s,
        ay + px * s + py * c,
      ];
      const [x0, y0] = corner(-hw, -hh);
      const [x1, y1] = corner(hw, -hh);
      const [x2, y2] = corner(hw, hh);
      const [x3, y3] = corner(-hw, hh);
      out.tri(x0, y0, x1, y1, x2, y2);
      out.tri(x0, y0, x2, y2, x3, y3);
      break;
    }
    case 'obround': {
      const rad = (shape.rotation * Math.PI) / 180;
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      const wide = shape.width >= shape.height;
      const half = Math.abs(shape.width - shape.height) / 2;
      const r = Math.min(shape.width, shape.height) / 2;
      // Unit vector of the long axis, then the capsule spine along it.
      const ux = wide ? c : -s;
      const uy = wide ? s : c;
      addCapsule(out, ax - ux * half, ay - uy * half, ax + ux * half, ay + uy * half, r);
      break;
    }
    case 'polygon':
      addPolygon(out, shape.points, ax, ay);
      break;
  }
}

function addCircle(out: TriangleBuffer, cx: number, cy: number, r: number): void {
  if (!(r > 0)) {
    return;
  }
  for (let k = 0; k < CIRCLE_SEGMENTS; k++) {
    const n = (k + 1) % CIRCLE_SEGMENTS;
    out.tri(
      cx,
      cy,
      cx + r * CIRCLE_COS[k],
      cy + r * CIRCLE_SIN[k],
      cx + r * CIRCLE_COS[n],
      cy + r * CIRCLE_SIN[n],
    );
  }
}

/** A line of width `2 * r` with round caps (a stadium); a plain circle when it has no length. */
function addCapsule(
  out: TriangleBuffer,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: number,
): void {
  if (!(r > 0)) {
    return;
  }
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (!(length > 0)) {
    addCircle(out, x1, y1, r);
    return;
  }
  const dx = (x2 - x1) / length;
  const dy = (y2 - y1) / length;
  const nx = -dy * r;
  const ny = dx * r;
  out.tri(x1 + nx, y1 + ny, x1 - nx, y1 - ny, x2 - nx, y2 - ny);
  out.tri(x1 + nx, y1 + ny, x2 - nx, y2 - ny, x2 + nx, y2 + ny);

  const rdx = dx * r;
  const rdy = dy * r;
  for (let k = 0; k < CAP_SEGMENTS; k++) {
    // End cap sweeps from +normal through the direction to -normal; the start cap mirrors it.
    const ax = nx * CAP_COS[k] + rdx * CAP_SIN[k];
    const ay = ny * CAP_COS[k] + rdy * CAP_SIN[k];
    const bx = nx * CAP_COS[k + 1] + rdx * CAP_SIN[k + 1];
    const by = ny * CAP_COS[k + 1] + rdy * CAP_SIN[k + 1];
    out.tri(x2, y2, x2 + ax, y2 + ay, x2 + bx, y2 + by);
    out.tri(x1, y1, x1 - ax, y1 - ay, x1 - bx, y1 - by);
  }
}

/**
 * Ear-clip triangulation of a simple polygon (either winding, concave allowed),
 * translated by (ox, oy). A repeated closing point and consecutive duplicates
 * are dropped and collinear corners are skipped. Self-intersecting or otherwise
 * degenerate input never throws and always terminates: when no ear is found
 * the current corner is clipped anyway.
 */
function addPolygon(out: TriangleBuffer, points: readonly Point[], ox: number, oy: number): void {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [px, py] of points) {
    const x = px + ox;
    const y = py + oy;
    if (!Number.isFinite(x + y)) {
      continue;
    }
    const last = xs.length - 1;
    if (last >= 0 && xs[last] === x && ys[last] === y) {
      continue;
    }
    xs.push(x);
    ys.push(y);
  }
  while (xs.length > 1 && xs[0] === xs[xs.length - 1] && ys[0] === ys[ys.length - 1]) {
    xs.pop();
    ys.pop();
  }
  const n = xs.length;
  if (n < 3) {
    return;
  }

  let area2 = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    area2 += xs[j] * ys[i] - xs[i] * ys[j];
  }
  if (area2 === 0) {
    return;
  }
  const sign = area2 > 0 ? 1 : -1;

  const prev = new Int32Array(n);
  const next = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    prev[i] = (i + n - 1) % n;
    next[i] = (i + 1) % n;
  }

  let remaining = n;
  let cur = 0;
  let sinceClip = 0;
  while (remaining > 3) {
    const p = prev[cur];
    const q = next[cur];
    const cross =
      sign * ((xs[cur] - xs[p]) * (ys[q] - ys[cur]) - (ys[cur] - ys[p]) * (xs[q] - xs[cur]));

    let clip = false;
    let emit = false;
    if (Math.abs(cross) <= COLLINEAR_EPS) {
      clip = true;
    } else if (cross > 0 && isEar(xs, ys, next, p, cur, q, sign)) {
      clip = true;
      emit = true;
    } else if (sinceClip >= remaining) {
      // No ear anywhere (self-intersecting input): force progress.
      clip = true;
      emit = cross > 0;
    }

    if (clip) {
      if (emit) {
        out.tri(xs[p], ys[p], xs[cur], ys[cur], xs[q], ys[q]);
      }
      next[p] = q;
      prev[q] = p;
      remaining--;
      cur = p;
      sinceClip = 0;
    } else {
      cur = q;
      sinceClip++;
    }
  }
  if (remaining === 3) {
    const p = prev[cur];
    const q = next[cur];
    out.tri(xs[p], ys[p], xs[cur], ys[cur], xs[q], ys[q]);
  }
}

/** True when no other polygon vertex lies inside (or on) triangle p, c, q. */
function isEar(
  xs: readonly number[],
  ys: readonly number[],
  next: Int32Array,
  p: number,
  c: number,
  q: number,
  sign: number,
): boolean {
  const ax = xs[p];
  const ay = ys[p];
  const bx = xs[c];
  const by = ys[c];
  const cx = xs[q];
  const cy = ys[q];
  for (let j = next[q]; j !== p; j = next[j]) {
    const x = xs[j];
    const y = ys[j];
    // Vertices coinciding with a triangle corner (touching rings) do not block.
    if ((x === ax && y === ay) || (x === bx && y === by) || (x === cx && y === cy)) {
      continue;
    }
    const d1 = sign * ((bx - ax) * (y - ay) - (by - ay) * (x - ax));
    const d2 = sign * ((cx - bx) * (y - by) - (cy - by) * (x - bx));
    const d3 = sign * ((ax - cx) * (y - cy) - (ay - cy) * (x - cx));
    if (d1 >= 0 && d2 >= 0 && d3 >= 0) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Outline

function collectOutlineDraws(layer: ParsedLayer, out: Point[][]): void {
  for (const p of layer.primitives) {
    if (
      p.type === 'draw' &&
      Number.isFinite(p.from[0] + p.from[1] + p.to[0] + p.to[1]) &&
      (p.from[0] !== p.to[0] || p.from[1] !== p.to[1])
    ) {
      out.push([p.from, p.to]);
    }
  }
}

function boundsRing(b: Bounds): Float32Array {
  return new Float32Array([
    b.minX,
    b.minY,
    b.maxX,
    b.minY,
    b.maxX,
    b.maxY,
    b.minX,
    b.maxY,
    b.minX,
    b.minY,
  ]);
}

function cellKey(ix: number, iy: number): string {
  return `${ix},${iy}`;
}

/**
 * Joins segments end to end. Endpoints within `JOIN_TOLERANCE` match (found
 * through a grid of tolerance-sized cells and their eight neighbours). A chain
 * grows from its tail, then from its head; one that ends where it began is a
 * closed ring and repeats its first point.
 */
function chainRings(segments: readonly Point[][]): Float32Array[] {
  const count = segments.length;
  if (count === 0) {
    return [];
  }
  const grid = new Map<string, number[]>();
  const cellOf = (v: number): number => Math.round(v / JOIN_TOLERANCE);
  for (let i = 0; i < count; i++) {
    for (const end of segments[i]) {
      const key = cellKey(cellOf(end[0]), cellOf(end[1]));
      const bucket = grid.get(key);
      if (bucket === undefined) {
        grid.set(key, [i]);
      } else {
        bucket.push(i);
      }
    }
  }

  const used = new Uint8Array(count);
  const near = (a: Point, b: Point): boolean =>
    Math.abs(a[0] - b[0]) <= JOIN_TOLERANCE && Math.abs(a[1] - b[1]) <= JOIN_TOLERANCE;

  /** Takes an unused segment touching `at` and returns its far end, or null. */
  const take = (at: Point): Point | null => {
    const cx = cellOf(at[0]);
    const cy = cellOf(at[1]);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.get(cellKey(cx + dx, cy + dy));
        if (bucket === undefined) {
          continue;
        }
        for (const i of bucket) {
          if (used[i] === 1) {
            continue;
          }
          const [a, b] = segments[i];
          if (near(a, at)) {
            used[i] = 1;
            return b;
          }
          if (near(b, at)) {
            used[i] = 1;
            return a;
          }
        }
      }
    }
    return null;
  };

  const rings: Float32Array[] = [];
  for (let s = 0; s < count; s++) {
    if (used[s] === 1) {
      continue;
    }
    used[s] = 1;
    const [first, second] = segments[s];
    let chain: Point[] = [first, second];
    for (let end = chain[chain.length - 1], nxt = take(end); nxt !== null; nxt = take(end)) {
      chain.push(nxt);
      end = nxt;
    }
    if (!near(chain[0], chain[chain.length - 1])) {
      const head: Point[] = [];
      for (let end = chain[0], nxt = take(end); nxt !== null; nxt = take(end)) {
        head.push(nxt);
        end = nxt;
      }
      head.reverse();
      chain = head.concat(chain);
    } else {
      chain[chain.length - 1] = chain[0];
    }

    const flat = new Float32Array(chain.length * 2);
    chain.forEach((pt, i) => {
      flat[i * 2] = pt[0];
      flat[i * 2 + 1] = pt[1];
    });
    rings.push(flat);
  }
  return rings;
}
