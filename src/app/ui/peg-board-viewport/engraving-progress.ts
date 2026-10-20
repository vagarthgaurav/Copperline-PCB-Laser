import { PathSegment } from './scene.types';

/** Cumulative feed length along a G-code path, for answering "how much is engraved at line N" quickly. */
export interface FeedProfile {
  /** Source line of each feed segment, ascending as in the program. */
  lines: number[];
  /** Feed length in mm up to and including each feed segment. */
  cumulative: number[];
}

export function feedProfile(path: readonly PathSegment[]): FeedProfile {
  const lines: number[] = [];
  const cumulative: number[] = [];
  let total = 0;
  for (const segment of path) {
    if (segment.kind === 'feed') {
      total += Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1);
      lines.push(segment.line);
      cumulative.push(total);
    }
  }
  return { lines, cumulative };
}

/** Total feed length in mm. */
export function feedLength(profile: FeedProfile): number {
  return profile.cumulative[profile.cumulative.length - 1] ?? 0;
}

/** Share (0..1) of the feed length produced by lines up to and including `doneLine`. */
export function engravedShare(profile: FeedProfile, doneLine: number): number {
  const total = feedLength(profile);
  if (total <= 0) {
    return 0;
  }
  // Binary search for the last segment with line <= doneLine.
  let low = 0;
  let high = profile.lines.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (profile.lines[mid] <= doneLine) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found < 0 ? 0 : Math.min(1, profile.cumulative[found] / total);
}
