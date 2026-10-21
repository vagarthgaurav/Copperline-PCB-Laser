/**
 * Types returned by the Rust command `parse_gerber_files`. They mirror the
 * serde output exactly (camelCase, internally tagged enums). All geometry is in
 * millimetres, in the board coordinates authored in the Gerber, +Y up.
 */

/** One file sent to the parser: name only (no path) and its UTF-8 text. */
export interface InputFile {
  name: string;
  content: string;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A hole of the non-plated drill file; the pegs the board is pinned on. Millimetres. */
export interface PegHole {
  x: number;
  y: number;
  diameter: number;
}

export type BoardSource = 'outline' | 'copper';

export interface BoardInfo {
  /** Outline layer bounds if there is an outline, else the union of the copper layers. */
  bounds: Bounds;
  source: BoardSource;
  /** Millimetres, from `bounds`. */
  width: number;
  height: number;
}

export type LayerKind = 'topCopper' | 'bottomCopper' | 'outline' | 'drill';

export type Point = [number, number];

export type FlashShape =
  | { kind: 'circle'; diameter: number }
  | { kind: 'rect'; width: number; height: number; rotation: number }
  | { kind: 'obround'; width: number; height: number; rotation: number }
  | { kind: 'polygon'; points: Point[] };

export type Primitive =
  | { type: 'draw'; from: Point; to: Point; width: number }
  | { type: 'flash'; at: Point; shape: FlashShape }
  | { type: 'region'; points: Point[] }
  | { type: 'hole'; at: Point; diameter: number };

export interface ParsedLayer {
  /** The file name, unique within a project. */
  id: string;
  fileName: string;
  kind: LayerKind;
  /** 'Top copper' | 'Bottom copper' | 'Outline' | 'Drill' */
  label: string;
  bounds: Bounds;
  primitiveCount: number;
  /** Non-fatal parser notes for this layer. */
  warnings: string[];
  primitives: Primitive[];
}

/** A file that was recognised but unsupported, or could not be parsed. Never fatal. */
export interface SkippedFile {
  fileName: string;
  reason: string;
}

export interface ParsedProject {
  name: string;
  /** Sorted: topCopper, bottomCopper, outline, drill. */
  layers: ParsedLayer[];
  skipped: SkippedFile[];
  /** Null when there are no layers. */
  board: BoardInfo | null;
  /** The physical blank, from the blank-edge layer; null when the project has none. Same frame as the layers. */
  blank: Bounds | null;
  /** Every hole of the non-plated drill file, in the same frame as the layers. */
  pegHoles: readonly PegHole[];
}
