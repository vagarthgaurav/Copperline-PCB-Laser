import { Bounds } from '@app/core/gerber.types';
import { PEG_BOARD, floorBounds } from '@app/core/peg-board';
import { boardTransform, grabBounds, transformedBounds } from '@app/ui/peg-board-viewport/scene-math';
import { BoardGeometry, ScenePalette } from '@app/ui/peg-board-viewport/scene.types';

/** Maps machine millimetres to canvas pixels: +X right, +Y up the screen. */
export interface FloorView {
  /** Pixels per millimetre. */
  scale: number;
  /** Canvas x of machine x = floor.minX. */
  left: number;
  /** Canvas y of machine y = floor.maxY. */
  top: number;
}

/** Fits the whole floor into a canvas of the given size, centred. */
export function fitFloor(width: number, height: number, floor: Bounds = floorBounds()): FloorView {
  const floorW = floor.maxX - floor.minX;
  const floorH = floor.maxY - floor.minY;
  const scale = Math.max(0.01, Math.min(width / floorW, height / floorH));
  return { scale, left: (width - floorW * scale) / 2, top: (height - floorH * scale) / 2 };
}

export function toCanvas(view: FloorView, x: number, y: number, floor: Bounds = floorBounds()): { x: number; y: number } {
  return { x: view.left + (x - floor.minX) * view.scale, y: view.top + (floor.maxY - y) * view.scale };
}

/** The inverse of `toCanvas`: the machine mm under a canvas pixel. */
export function fromCanvas(view: FloorView, px: number, py: number, floor: Bounds = floorBounds()): { x: number; y: number } {
  return { x: floor.minX + (px - view.left) / view.scale, y: floor.maxY - (py - view.top) / view.scale };
}

/** A pixel drag as a machine move in millimetres (screen down is machine -Y). */
export function dragToMm(view: FloorView, dxPx: number, dyPx: number): { dx: number; dy: number } {
  return { dx: dxPx / view.scale, dy: -dyPx / view.scale };
}

/** The placed board's grab area in machine mm (the board, widened to its blank). */
export function placedGrabBounds(
  geometry: BoardGeometry,
  offsetX: number,
  offsetY: number,
  quarterTurns: number,
  mirrored: boolean,
): Bounds {
  const m = boardTransform(geometry.bounds, offsetX, offsetY, quarterTurns, mirrored);
  return transformedBounds(grabBounds(geometry.bounds, geometry.blank), m);
}

/** Whether a machine-mm point is within `slack` mm of the rectangle. */
export function hitsWithin(bounds: Bounds, x: number, y: number, slack: number): boolean {
  return x >= bounds.minX - slack && x <= bounds.maxX + slack && y >= bounds.minY - slack && y <= bounds.maxY + slack;
}

/** The board art drawn once in its placed orientation; moving the board only moves this bitmap. */
export interface BoardBitmap {
  canvas: HTMLCanvasElement;
  /** Machine mm of the bitmap's left and top edge when the board's offset is (0, 0). */
  originX: number;
  originY: number;
}

export function renderBoardBitmap(
  geometry: BoardGeometry,
  quarterTurns: number,
  mirrored: boolean,
  scale: number,
  palette: ScenePalette,
): BoardBitmap | null {
  const m = boardTransform(geometry.bounds, 0, 0, quarterTurns, mirrored);
  const extent = transformedBounds(grabBounds(geometry.bounds, geometry.blank), m);
  const width = Math.max(1, Math.ceil((extent.maxX - extent.minX) * scale));
  const height = Math.max(1, Math.ceil((extent.maxY - extent.minY) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  // Board mm to bitmap px, flipping Y so +Y is up.
  ctx.setTransform(scale * m.a, -scale * m.b, scale * m.c, -scale * m.d, scale * (m.e - extent.minX), scale * (extent.maxY - m.f));

  if (geometry.blank) {
    const b = geometry.blank;
    ctx.fillStyle = palette.blank;
    ctx.fillRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
  }

  const bb = geometry.bounds;
  ctx.fillStyle = palette.board;
  ctx.fillRect(bb.minX, bb.minY, bb.maxX - bb.minX, bb.maxY - bb.minY);

  const tri = geometry.copper;
  ctx.fillStyle = palette.copper;
  ctx.beginPath();
  for (let i = 0; i + 5 < tri.length; i += 6) {
    ctx.moveTo(tri[i], tri[i + 1]);
    ctx.lineTo(tri[i + 2], tri[i + 3]);
    ctx.lineTo(tri[i + 4], tri[i + 5]);
    ctx.closePath();
  }
  ctx.fill();

  ctx.strokeStyle = palette.rim;
  ctx.lineWidth = 1 / scale;
  for (const ring of geometry.outline) {
    ctx.beginPath();
    for (let i = 0; i + 1 < ring.length; i += 2) {
      if (i === 0) {
        ctx.moveTo(ring[i], ring[i + 1]);
      } else {
        ctx.lineTo(ring[i], ring[i + 1]);
      }
    }
    ctx.stroke();
  }

  ctx.fillStyle = palette.floor;
  for (const hole of geometry.holes) {
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, hole.diameter / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = palette.peg;
  for (const peg of geometry.pegHoles) {
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, peg.diameter / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  return { canvas, originX: extent.minX, originY: extent.maxY };
}

/** Draws the peg-board floor: the slab, the hole grid and a ring on the origin hole. */
export function drawFloor(ctx: CanvasRenderingContext2D, view: FloorView, palette: ScenePalette): void {
  const floor = floorBounds();
  const a = toCanvas(view, floor.minX, floor.maxY);
  ctx.fillStyle = palette.floor;
  ctx.fillRect(a.x, a.y, (floor.maxX - floor.minX) * view.scale, (floor.maxY - floor.minY) * view.scale);

  const radius = Math.max(1.5, (PEG_BOARD.holeDiameter / 2) * view.scale);
  ctx.fillStyle = palette.bg;
  for (let ix = 0; ix < PEG_BOARD.holesX; ix++) {
    for (let iy = 0; iy < PEG_BOARD.holesY; iy++) {
      const p = toCanvas(view, ix * PEG_BOARD.holePitch, iy * PEG_BOARD.holePitch);
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const origin = toCanvas(view, 0, 0);
  ctx.strokeStyle = palette.laser;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, radius + 3, 0, Math.PI * 2);
  ctx.stroke();
}

/** Draws the laser head as a ring with a dot. */
export function drawHead(ctx: CanvasRenderingContext2D, view: FloorView, x: number, y: number, palette: ScenePalette): void {
  const p = toCanvas(view, x, y);
  ctx.strokeStyle = palette.laser;
  ctx.fillStyle = palette.laser;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
  ctx.fill();
}
