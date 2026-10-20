import { Bounds } from '../../core/gerber.types';

/**
 * Contract between `PegBoardViewport` (Angular chrome, owns the canvas element)
 * and `PegBoardScene` (plain Three.js, no Angular imports). All lengths are mm
 * in machine coordinates (see `core/peg-board.ts`): +X right, +Y away, Z up.
 */

/** Resolved colours (CSS colour strings) read from the `--scene-*` tokens. */
export interface ScenePalette {
  bg: string;
  floor: string;
  peg: string;
  board: string;
  copper: string;
  laser: string;
  done: string;
  /** `--border-strong`: the board rim. */
  rim: string;
  /** `--ink`: peg label text. */
  ink: string;
}

/** Triangulated copper for one board side, in board coordinates (Gerber mm, +Y up). */
export interface BoardGeometry {
  /** Board bounds (outline, else copper). The lower-left corner is the placement anchor. */
  bounds: Bounds;
  /** Flat x,y pairs, three vertices per triangle. Draws are expanded to quads, flashes and regions triangulated. */
  copper: Float32Array;
  /** Board outline as closed polylines (flat x,y pairs per ring); a rectangle of `bounds` when there is no outline layer. */
  outline: Float32Array[];
  /** Drill holes. */
  holes: { x: number; y: number; diameter: number }[];
}

/** One G-code move as a segment, in machine mm. */
export interface PathSegment {
  /** 1-based G-code line that produced it. */
  line: number;
  kind: 'rapid' | 'feed';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SceneState {
  /** Null shows an empty peg board. */
  board: BoardGeometry | null;
  offsetX: number;
  offsetY: number;
  /** Quarter turns clockwise seen from above, 0..3, about the board centre. */
  quarterTurns: number;
  /** Board flipped over (mirrored across its vertical centre axis); used for the Bottom side. */
  mirrored: boolean;
  /** G-code feed moves; those with line <= `doneLine` are drawn engraved (thicker, `done`), the rest dashed. */
  path: readonly PathSegment[];
  doneLine: number;
  /** Laser head XY; null hides head and beam. */
  tool: { x: number; y: number } | null;
}

/** Everything the chrome needs from the scene. */
export interface PegBoardSceneApi {
  setPalette(palette: ScenePalette): void;
  setState(state: SceneState): void;
  resize(width: number, height: number, pixelRatio: number): void;
  /**
   * Machine-mm position under a canvas pixel (0,0 = top-left of the canvas) on the floor plane,
   * or null if the ray misses the floor. Used for dragging.
   */
  floorPoint(canvasX: number, canvasY: number): { x: number; y: number } | null;
  /** True when the canvas pixel is over the board. */
  hitBoard(canvasX: number, canvasY: number): boolean;
  /**
   * Swings the camera around its target: azimuth positive moves it toward +X (right), elevation
   * positive raises it. Elevation is clamped to 15..89 degrees, azimuth is not.
   */
  orbit(dAzimuthDeg: number, dElevationDeg: number): void;
  /**
   * Drags the floor: the floor point under (fromX, fromY) ends up under (toX, toY), canvas pixels.
   * The target stays within the floor plus 20% on each side. No-op when either ray misses the floor.
   */
  pan(fromX: number, fromY: number, toX: number, toY: number): void;
  /**
   * Moves the view by fractions of the canvas size: positive `dxFrac` looks further right,
   * positive `dyFrac` further up the screen. For keyboard panning.
   */
  panScreen(dxFrac: number, dyFrac: number): void;
  /**
   * Zooms by `factor` (> 1 zooms in), total level clamped to 0.5..8. With a canvas point the floor
   * point under it stays under it; without one, or when it misses the floor, zooms about the target.
   */
  zoom(factor: number, canvasX?: number, canvasY?: number): void;
  /** Back to elevation 45 degrees, no yaw, zoom 1, looking at the floor centre. */
  resetView(): void;
  dispose(): void;
}
