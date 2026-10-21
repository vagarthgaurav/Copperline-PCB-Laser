import { Bounds } from '../../core/gerber.types';
import { PathSegment } from './scene.types';

/**
 * Pure maths for `PegBoardScene`, kept free of Three.js so it can be unit
 * tested without WebGL. Machine coordinates: mm, +X right, +Y away, Z up.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** 2D affine map: x' = a*x + c*y + e, y' = b*x + d*y + f (canvas matrix convention). */
export interface Affine2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export function applyAffine(m: Affine2D, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

/**
 * Board coordinates to machine coordinates. This is the single place the
 * placement lives. Order: centre the bounds on the origin, mirror (x -> -x),
 * rotate `quarterTurns` * 90 degrees clockwise seen from above, then translate
 * so the lower-left corner of the resulting bounding box sits at the offset.
 */
export function boardTransform(
  bounds: Bounds,
  offsetX: number,
  offsetY: number,
  quarterTurns: number,
  mirrored: boolean,
): Affine2D {
  let a = mirrored ? -1 : 1;
  let b = 0;
  let c = 0;
  let d = 1;
  const turns = ((Math.round(quarterTurns) % 4) + 4) % 4;
  for (let i = 0; i < turns; i++) {
    // Clockwise quarter turn is (x, y) -> (y, -x), applied after the current map.
    [a, b, c, d] = [b, -a, d, -c];
  }

  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const centred: Affine2D = { a, b, c, d, e: -(a * cx + c * cy), f: -(b * cx + d * cy) };
  const box = transformedBounds(bounds, centred);
  return { ...centred, e: centred.e + offsetX - box.minX, f: centred.f + offsetY - box.minY };
}

/** Axis-aligned bounds of a rectangle after an affine map. */
export function transformedBounds(bounds: Bounds, m: Affine2D): Bounds {
  const corners = [
    applyAffine(m, bounds.minX, bounds.minY),
    applyAffine(m, bounds.maxX, bounds.minY),
    applyAffine(m, bounds.maxX, bounds.maxY),
    applyAffine(m, bounds.minX, bounds.maxY),
  ];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/** The area that grabs the board: its bounds, widened to the blank when there is one. */
export function grabBounds(bounds: Bounds, blank: Bounds | null): Bounds {
  if (!blank) return bounds;
  return {
    minX: Math.min(bounds.minX, blank.minX),
    minY: Math.min(bounds.minY, blank.minY),
    maxX: Math.max(bounds.maxX, blank.maxX),
    maxY: Math.max(bounds.maxY, blank.maxY),
  };
}

/** Whether a machine-mm point lies over the placed board. */
export function pointInBoard(x: number, y: number, bounds: Bounds, m: Affine2D): boolean {
  const box = transformedBounds(bounds, m);
  return x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;
}

export interface CameraFitInput {
  /** Points that must stay in view, e.g. the floor slab corners. */
  points: readonly Vec3[];
  target: Vec3;
  /** Degrees above the floor. */
  elevationDeg: number;
  /** Degrees the camera is swung around the target; 0 looks along +Y from the front. */
  yawDeg: number;
  /** Vertical field of view in degrees. */
  fovDeg: number;
  aspect: number;
  /** Extra room as a fraction of the view, e.g. 0.05. */
  margin: number;
}

export interface CameraFit {
  position: Vec3;
  distance: number;
}

/**
 * Closest camera position (on the ray from the target toward the viewer) that
 * keeps every point inside the frustum, with margin. A point at camera depth
 * `z = dist + p.forward` fits when `|p.right| <= z * tanH` and `|p.up| <= z * tanV`,
 * so the distance is the maximum of those bounds: closed form, no iteration.
 */
export function fitCamera(input: CameraFitInput): CameraFit {
  const { toCamera, forward, right, up } = viewBasis(input.elevationDeg, input.yawDeg);

  const tanV = Math.tan((input.fovDeg * Math.PI) / 360);
  const tanH = tanV * input.aspect;
  const room = 1 + input.margin;
  let distance = 0;
  for (const p of input.points) {
    const rel = { x: p.x - input.target.x, y: p.y - input.target.y, z: p.z - input.target.z };
    const depth = dot(rel, forward);
    distance = Math.max(
      distance,
      (Math.abs(dot(rel, right)) / tanH) * room - depth,
      (Math.abs(dot(rel, up)) / tanV) * room - depth,
    );
  }
  return {
    distance,
    position: {
      x: input.target.x + toCamera.x * distance,
      y: input.target.y + toCamera.y * distance,
      z: input.target.z + toCamera.z * distance,
    },
  };
}

/** Unit vectors of a camera that looks at its target from `elevationDeg` above the floor, swung `yawDeg`. */
export function viewBasis(
  elevationDeg: number,
  yawDeg: number,
): { toCamera: Vec3; forward: Vec3; right: Vec3; up: Vec3 } {
  const el = (elevationDeg * Math.PI) / 180;
  const yaw = (yawDeg * Math.PI) / 180;
  const toCamera: Vec3 = {
    x: Math.sin(yaw) * Math.cos(el),
    y: -Math.cos(yaw) * Math.cos(el),
    z: Math.sin(el),
  };
  const forward = scale(toCamera, -1);
  const right = normalize(cross(forward, { x: 0, y: 0, z: 1 }));
  const up = cross(right, forward);
  return { toCamera, forward, right, up };
}

// --- camera navigation ---------------------------------------------------

/** Orbit elevation limits in degrees: never under the floor, never exactly top-down. */
export const ELEVATION_MIN = 15;
export const ELEVATION_MAX = 89;
/** Zoom level limits; the distance is the fitted distance divided by the level. */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 8;
/** The target may leave the floor by this share of its size on each side. */
export const TARGET_OVERSHOOT = 0.2;
export const DEFAULT_ELEVATION = 45;

/** What the user changes with orbit, pan and zoom. The target is a point on the floor plane (z = 0). */
export interface ViewState {
  /** Degrees the camera is swung around the target (same as `CameraFitInput.yawDeg`); positive moves it toward +X. */
  azimuthDeg: number;
  elevationDeg: number;
  /** 1 is the fitted view; larger is closer. */
  zoom: number;
  target: { x: number; y: number };
}

/** What a view needs, besides its state, to turn canvas points into rays. */
export interface ViewCamera {
  /** Distance that fits the whole floor at zoom 1 for the view's orientation. */
  fitDistance: number;
  fovDeg: number;
  /** Width over height. */
  aspect: number;
}

export interface Ndc {
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Elevation 45 degrees, no yaw, zoom 1, looking at the middle of the floor. */
export function defaultView(floor: Bounds): ViewState {
  return {
    azimuthDeg: 0,
    elevationDeg: DEFAULT_ELEVATION,
    zoom: 1,
    target: { x: (floor.minX + floor.maxX) / 2, y: (floor.minY + floor.maxY) / 2 },
  };
}

/** Swings around the target. Elevation is clamped, azimuth is not. Non-finite deltas are ignored. */
export function orbitView(view: ViewState, dAzimuthDeg: number, dElevationDeg: number): ViewState {
  return {
    ...view,
    azimuthDeg: view.azimuthDeg + (Number.isFinite(dAzimuthDeg) ? dAzimuthDeg : 0),
    elevationDeg: clamp(
      view.elevationDeg + (Number.isFinite(dElevationDeg) ? dElevationDeg : 0),
      ELEVATION_MIN,
      ELEVATION_MAX,
    ),
  };
}

/** Multiplies the zoom level by `factor` (> 1 zooms in), clamped. Non-positive or non-finite factors are ignored. */
export function zoomView(view: ViewState, factor: number): ViewState {
  if (!Number.isFinite(factor) || factor <= 0) return view;
  return { ...view, zoom: clamp(view.zoom * factor, ZOOM_MIN, ZOOM_MAX) };
}

/** Keeps a target within the floor expanded by `TARGET_OVERSHOOT` of its size on each side. */
export function clampTarget(
  target: { x: number; y: number },
  floor: Bounds,
): { x: number; y: number } {
  const padX = (floor.maxX - floor.minX) * TARGET_OVERSHOOT;
  const padY = (floor.maxY - floor.minY) * TARGET_OVERSHOOT;
  return {
    x: clamp(target.x, floor.minX - padX, floor.maxX + padX),
    y: clamp(target.y, floor.minY - padY, floor.maxY + padY),
  };
}

/** Canvas pixels (0,0 top-left) to normalised device coordinates (y up). */
export function canvasToNdc(canvasX: number, canvasY: number, width: number, height: number): Ndc {
  return { x: (canvasX / width) * 2 - 1, y: -(canvasY / height) * 2 + 1 };
}

/** Camera position, looking at the target from `fitDistance / zoom`. */
export function viewPosition(view: ViewState, fitDistance: number): Vec3 {
  const { toCamera } = viewBasis(view.elevationDeg, view.azimuthDeg);
  const distance = fitDistance / view.zoom;
  return {
    x: view.target.x + toCamera.x * distance,
    y: view.target.y + toCamera.y * distance,
    z: toCamera.z * distance,
  };
}

/** The ray from the camera through an NDC point; the same one a Three.js perspective camera casts. */
export function viewRay(
  view: ViewState,
  camera: ViewCamera,
  ndc: Ndc,
): { origin: Vec3; direction: Vec3 } {
  const { forward, right, up } = viewBasis(view.elevationDeg, view.azimuthDeg);
  const tanV = Math.tan((camera.fovDeg * Math.PI) / 360);
  const tanH = tanV * camera.aspect;
  const direction = normalize({
    x: forward.x + right.x * ndc.x * tanH + up.x * ndc.y * tanV,
    y: forward.y + right.y * ndc.x * tanH + up.y * ndc.y * tanV,
    z: forward.z + right.z * ndc.x * tanH + up.z * ndc.y * tanV,
  });
  return { origin: viewPosition(view, camera.fitDistance), direction };
}

/** The floor-plane point (z = 0) under an NDC point, or null when the ray misses. */
export function floorPointAt(
  view: ViewState,
  camera: ViewCamera,
  ndc: Ndc,
): { x: number; y: number } | null {
  const { origin, direction } = viewRay(view, camera, ndc);
  return rayPlaneZ(origin, direction, 0);
}

/**
 * Moves the target so the floor point that was under `from` ends up under
 * `to`. Unchanged when either ray misses the floor.
 */
export function panView(
  view: ViewState,
  camera: ViewCamera,
  from: Ndc,
  to: Ndc,
  floor: Bounds,
): ViewState {
  const a = floorPointAt(view, camera, from);
  const b = floorPointAt(view, camera, to);
  if (!a || !b) return view;
  return {
    ...view,
    target: clampTarget({ x: view.target.x + a.x - b.x, y: view.target.y + a.y - b.y }, floor),
  };
}

/**
 * Zoom by `factor`. With an NDC point, the target also moves so the floor
 * point under that point stays under it; without one, or when the ray
 * misses the floor, it is a plain zoom about the target.
 */
export function zoomViewAt(
  view: ViewState,
  camera: ViewCamera,
  factor: number,
  at: Ndc | null,
  floor: Bounds,
): ViewState {
  const next = zoomView(view, factor);
  if (!at || next.zoom === view.zoom) return next;
  const before = floorPointAt(view, camera, at);
  const after = floorPointAt(next, camera, at);
  if (!before || !after) return next;
  return {
    ...next,
    target: clampTarget(
      { x: next.target.x + before.x - after.x, y: next.target.y + before.y - after.y },
      floor,
    ),
  };
}

/**
 * Near and far planes that bracket `points` from the view's camera. Points
 * behind the camera (zoomed in close) are left out of the near bound.
 */
export function clipRange(
  view: ViewState,
  camera: ViewCamera,
  points: readonly Vec3[],
): { near: number; far: number } {
  const { forward } = viewBasis(view.elevationDeg, view.azimuthDeg);
  const position = viewPosition(view, camera.fitDistance);
  let min = Infinity;
  let max = 0;
  for (const p of points) {
    const depth = dot({ x: p.x - position.x, y: p.y - position.y, z: p.z - position.z }, forward);
    min = Math.min(min, depth);
    max = Math.max(max, depth);
  }
  const near = Math.max(NEAR_MIN, min * 0.9);
  return { near, far: Math.max(max * 1.1, near + 1) };
}

/** Closest the near plane may get, mm. */
const NEAR_MIN = 0.5;

/** Where a ray meets the horizontal plane at `z`, or null when it points away or runs parallel. */
export function rayPlaneZ(
  origin: Vec3,
  direction: Vec3,
  z: number,
): { x: number; y: number } | null {
  if (Math.abs(direction.z) < 1e-9) return null;
  const t = (z - origin.z) / direction.z;
  if (t <= 0) return null;
  return { x: origin.x + direction.x * t, y: origin.y + direction.y * t };
}

/**
 * Centres of the floor's peg holes, flat x,y pairs. Holes sit on multiples of
 * `pitch` (so the origin is on one); any that would touch the floor edge are skipped.
 */
export function holeGrid(floor: Bounds, pitch: number, diameter: number): Float32Array {
  const r = diameter / 2;
  const out: number[] = [];
  for (let x = Math.ceil(floor.minX / pitch) * pitch; x <= floor.maxX; x += pitch) {
    if (x - r < floor.minX || x + r > floor.maxX) continue;
    for (let y = Math.ceil(floor.minY / pitch) * pitch; y <= floor.maxY; y += pitch) {
      if (y - r < floor.minY || y + r > floor.maxY) continue;
      out.push(x, y);
    }
  }
  return new Float32Array(out);
}

/** The feed moves of a program as flat x1,y1,x2,y2 plus the G-code line of each. */
export interface FeedMoves {
  coords: Float32Array;
  lines: Int32Array;
}

/** Keeps feed moves only (rapids are not drawn), preserving program order. */
export function extractFeed(path: readonly PathSegment[]): FeedMoves {
  let count = 0;
  for (const s of path) if (s.kind === 'feed') count++;
  const coords = new Float32Array(count * 4);
  const lines = new Int32Array(count);
  let i = 0;
  for (const s of path) {
    if (s.kind !== 'feed') continue;
    coords.set([s.x1, s.y1, s.x2, s.y2], i * 4);
    lines[i++] = s.line;
  }
  return { coords, lines };
}

/**
 * How many leading moves have `line <= doneLine`. Moves are in line order, so
 * this is a binary search (upper bound).
 */
export function countDone(lines: ArrayLike<number>, doneLine: number): number {
  let lo = 0;
  let hi = lines.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (lines[mid] <= doneLine) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export const VERTICES_PER_STRIP = 6;

/**
 * One flat quad (two triangles, 6 vertices, x,y,z with z = 0) per segment of
 * `coords` (x1,y1,x2,y2), `width` mm wide. `extend` pushes both ends outward
 * so consecutive segments of a curve leave no gaps. A zero-length segment
 * yields a degenerate quad so indices stay aligned with the input.
 */
export function stripQuads(coords: Float32Array, width: number, extend = 0): Float32Array {
  const n = coords.length / 4;
  const out = new Float32Array(n * VERTICES_PER_STRIP * 3);
  const half = width / 2;
  for (let i = 0; i < n; i++) {
    const x1 = coords[i * 4];
    const y1 = coords[i * 4 + 1];
    const x2 = coords[i * 4 + 2];
    const y2 = coords[i * 4 + 3];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    const ux = dx / len;
    const uy = dy / len;
    const ax = x1 - ux * extend;
    const ay = y1 - uy * extend;
    const bx = x2 + ux * extend;
    const by = y2 + uy * extend;
    const nx = -uy * half;
    const ny = ux * half;
    // Counter-clockwise seen from +Z: a-right, b-right, b-left, then a-right, b-left, a-left.
    out.set(
      [
        ax - nx,
        ay - ny,
        0,
        bx - nx,
        by - ny,
        0,
        bx + nx,
        by + ny,
        0,
        ax - nx,
        ay - ny,
        0,
        bx + nx,
        by + ny,
        0,
        ax + nx,
        ay + ny,
        0,
      ],
      i * VERTICES_PER_STRIP * 3,
    );
  }
  return out;
}

export interface Dashes {
  /** Dash endpoints as flat x1,y1,x2,y2. */
  coords: Float32Array;
  /** `firstDash[i]` is the index of the first dash of move `i`; length is moves + 1. */
  firstDash: Uint32Array;
}

/**
 * Splits each move into dashes of `dash` mm separated by `gap` mm, restarting
 * the pattern at every move. Returns null when that would exceed `maxDashes`,
 * so the caller can fall back to solid lines.
 */
export function buildDashes(
  coords: Float32Array,
  dash: number,
  gap: number,
  maxDashes: number,
): Dashes | null {
  const moves = coords.length / 4;
  const period = dash + gap;
  const lengths = new Float64Array(moves);
  let total = 0;
  for (let i = 0; i < moves; i++) {
    lengths[i] = Math.hypot(
      coords[i * 4 + 2] - coords[i * 4],
      coords[i * 4 + 3] - coords[i * 4 + 1],
    );
    total += lengths[i] > 0 ? Math.ceil(lengths[i] / period) : 0;
    if (total > maxDashes) return null;
  }

  const out = new Float32Array(total * 4);
  const firstDash = new Uint32Array(moves + 1);
  let k = 0;
  for (let i = 0; i < moves; i++) {
    firstDash[i] = k;
    const len = lengths[i];
    if (len === 0) continue;
    const x1 = coords[i * 4];
    const y1 = coords[i * 4 + 1];
    const ux = (coords[i * 4 + 2] - x1) / len;
    const uy = (coords[i * 4 + 3] - y1) / len;
    for (let s = 0; s < len; s += period) {
      const e = Math.min(s + dash, len);
      out.set([x1 + ux * s, y1 + uy * s, x1 + ux * e, y1 + uy * e], k * 4);
      k++;
    }
  }
  firstDash[moves] = k;
  return { coords: out, firstDash };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function normalize(a: Vec3): Vec3 {
  return scale(a, 1 / Math.hypot(a.x, a.y, a.z));
}
