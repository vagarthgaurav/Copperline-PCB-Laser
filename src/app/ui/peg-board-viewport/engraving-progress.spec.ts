import { engravedShare, feedLength, feedProfile } from './engraving-progress';
import { PathSegment } from './scene.types';

const path: PathSegment[] = [
  { line: 1, kind: 'rapid', x1: 0, y1: 0, x2: 100, y2: 0 },
  { line: 2, kind: 'feed', x1: 100, y1: 0, x2: 110, y2: 0 },
  { line: 3, kind: 'feed', x1: 110, y1: 0, x2: 110, y2: 30 },
];

describe('engraving progress', () => {
  it('sums only feed moves', () => {
    expect(feedLength(feedProfile(path))).toBe(40);
    expect(feedLength(feedProfile([]))).toBe(0);
  });

  it('gives the engraved share up to a line', () => {
    const profile = feedProfile(path);
    expect(engravedShare(profile, 0)).toBe(0);
    expect(engravedShare(profile, 1)).toBe(0);
    expect(engravedShare(profile, 2)).toBe(0.25);
    expect(engravedShare(profile, 3)).toBe(1);
    expect(engravedShare(profile, 99)).toBe(1);
  });

  it('is zero without feed moves', () => {
    expect(engravedShare(feedProfile([]), 5)).toBe(0);
  });
});
