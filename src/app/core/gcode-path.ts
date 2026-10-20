export interface GcodePoint {
  x: number;
  y: number;
}

export interface GcodeMove {
  /** `rapid` is G0, `feed` is G1. */
  kind: 'rapid' | 'feed';
  /** Straight-line length in mm. */
  length: number;
  /** The modal F word in force (mm/min), or null when none was given yet. */
  feed: number | null;
}

export interface GcodeTrace {
  /** Position after executing each line (index 0 is line 1); null before any X/Y was seen. */
  positions: readonly (GcodePoint | null)[];
  moves: readonly GcodeMove[];
}

const WORDS = /([A-Za-z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g;

/**
 * Walks G0/G1 moves modally (absolute coordinates, millimetres). Comments
 * (`;` to end of line, and `( ... )`) are ignored and letters are case
 * insensitive. A missing axis keeps its last value, or 0 before the first
 * X/Y word. Other motion modes (arcs) are not interpreted.
 */
export function traceGcode(lines: readonly string[]): GcodeTrace {
  const positions: (GcodePoint | null)[] = [];
  const moves: GcodeMove[] = [];
  let mode: 'rapid' | 'feed' | null = null;
  let feed: number | null = null;
  let x = 0;
  let y = 0;
  let seen = false;

  for (const line of lines) {
    const code = line.replace(/\(.*?\)/g, ' ').split(';')[0];
    let nextX: number | undefined;
    let nextY: number | undefined;
    for (const match of code.matchAll(WORDS)) {
      const letter = match[1].toUpperCase();
      const value = Number(match[2]);
      if (letter === 'G') {
        if (value === 0) {
          mode = 'rapid';
        } else if (value === 1) {
          mode = 'feed';
        }
      } else if (letter === 'F') {
        feed = value;
      } else if (letter === 'X') {
        nextX = value;
      } else if (letter === 'Y') {
        nextY = value;
      }
    }

    if (nextX !== undefined || nextY !== undefined) {
      const toX = nextX ?? x;
      const toY = nextY ?? y;
      if (mode !== null) {
        moves.push({ kind: mode, length: Math.hypot(toX - x, toY - y), feed });
      }
      x = toX;
      y = toY;
      seen = true;
    }
    positions.push(seen ? { x, y } : null);
  }
  return { positions, moves };
}
