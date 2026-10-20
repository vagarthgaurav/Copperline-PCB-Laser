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

/** One G-code move as a segment in the same coordinates as the program. */
export interface GcodeSegment {
  /** 1-based G-code line that produced it. */
  line: number;
  kind: 'rapid' | 'feed';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface Step extends GcodeSegment {
  feed: number | null;
}

interface Walk {
  positions: (GcodePoint | null)[];
  steps: Step[];
}

const WORDS = /([A-Za-z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g;

/**
 * The one modal parser behind `traceGcode` and `gcodeSegments`: absolute
 * coordinates in millimetres, comments (`;` to end of line, and `( ... )`)
 * ignored, letters case insensitive. A missing axis keeps its last value, or 0
 * before the first X/Y word. Only G0/G1 are interpreted (no arcs). Every line
 * that moves X/Y while a mode is known yields a step, even a zero-length one.
 */
function walk(lines: readonly string[]): Walk {
  const positions: (GcodePoint | null)[] = [];
  const steps: Step[] = [];
  let mode: 'rapid' | 'feed' | null = null;
  let feed: number | null = null;
  let x = 0;
  let y = 0;
  let seen = false;

  lines.forEach((line, index) => {
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
        steps.push({ line: index + 1, kind: mode, feed, x1: x, y1: y, x2: toX, y2: toY });
      }
      x = toX;
      y = toY;
      seen = true;
    }
    positions.push(seen ? { x, y } : null);
  });
  return { positions, steps };
}

/**
 * Walks G0/G1 moves modally (absolute coordinates, millimetres). Comments
 * (`;` to end of line, and `( ... )`) are ignored and letters are case
 * insensitive. A missing axis keeps its last value, or 0 before the first
 * X/Y word. Other motion modes (arcs) are not interpreted.
 */
export function traceGcode(lines: readonly string[]): GcodeTrace {
  const { positions, steps } = walk(lines);
  const moves = steps.map((s) => ({
    kind: s.kind,
    length: Math.hypot(s.x2 - s.x1, s.y2 - s.y1),
    feed: s.feed,
  }));
  return { positions, moves };
}

/**
 * The G0/G1 moves of a program as segments, parsed exactly like `traceGcode`.
 * Lines without an X/Y move, moves before any G0/G1 and zero-length moves
 * produce no segment.
 */
export function gcodeSegments(lines: readonly string[]): GcodeSegment[] {
  const out: GcodeSegment[] = [];
  for (const s of walk(lines).steps) {
    if (s.x1 !== s.x2 || s.y1 !== s.y2) {
      out.push({ line: s.line, kind: s.kind, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 });
    }
  }
  return out;
}
