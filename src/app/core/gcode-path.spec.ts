import { gcodeSegments, traceGcode } from './gcode-path';

describe('traceGcode', () => {
  it('has no position before the first X/Y', () => {
    const { positions } = traceGcode(['G21', 'M3 S100', 'G1 X1 Y2']);
    expect(positions).toEqual([null, null, { x: 1, y: 2 }]);
  });

  it('is modal for the motion mode and missing axes', () => {
    const { positions, moves } = traceGcode(['G1 X3 Y4 F600', 'X6', 'Y8']);
    expect(positions[1]).toEqual({ x: 6, y: 4 });
    expect(positions[2]).toEqual({ x: 6, y: 8 });
    expect(moves.map((m) => [m.kind, m.length, m.feed])).toEqual([
      ['feed', 5, 600],
      ['feed', 3, 600],
      ['feed', 4, 600],
    ]);
  });

  it('ignores comments and tolerates case and spacing', () => {
    const { positions } = traceGcode(['; G1 X99', 'g0 x1.5 y-2 ; X50', '(G1 X7) Y3']);
    expect(positions).toEqual([null, { x: 1.5, y: -2 }, { x: 1.5, y: 3 }]);
  });

  it('distinguishes rapids from feed moves', () => {
    const { moves } = traceGcode(['G0 X10', 'G1 X20 F100']);
    expect(moves.map((m) => m.kind)).toEqual(['rapid', 'feed']);
    expect(moves[0].feed).toBeNull();
  });

  it('skips moves before any motion mode is set but still tracks position', () => {
    const { positions, moves } = traceGcode(['X5 Y5']);
    expect(moves).toEqual([]);
    expect(positions[0]).toEqual({ x: 5, y: 5 });
  });
});

describe('gcodeSegments', () => {
  it('emits 1-based lines, modal kinds and start/end points', () => {
    const segs = gcodeSegments(['G21', 'G0 X1 Y2', 'G1 X4 Y6 F300', 'X8', '; note']);
    expect(segs).toEqual([
      { line: 2, kind: 'rapid', x1: 0, y1: 0, x2: 1, y2: 2 },
      { line: 3, kind: 'feed', x1: 1, y1: 2, x2: 4, y2: 6 },
      { line: 4, kind: 'feed', x1: 4, y1: 6, x2: 8, y2: 6 },
    ]);
  });

  it('skips moves without a known mode but still tracks the position', () => {
    const segs = gcodeSegments(['X5 Y5', 'G1 X6']);
    expect(segs).toEqual([{ line: 2, kind: 'feed', x1: 5, y1: 5, x2: 6, y2: 5 }]);
  });

  it('skips zero-length moves and lines without X/Y', () => {
    expect(gcodeSegments(['G1 X1 Y1', 'G1 X1 Y1', 'G1 F200', 'M3 S100'])).toHaveLength(1);
  });

  it('agrees with traceGcode on move count and length', () => {
    const lines = ['G0 X1', 'G1 X1 F10', 'G1 Y3', '(c) G0 X-2 Y-1 ; x'];
    const trace = traceGcode(lines).moves.filter((m) => m.length > 0);
    const segs = gcodeSegments(lines);
    expect(segs.map((s) => [s.kind, Math.hypot(s.x2 - s.x1, s.y2 - s.y1)])).toEqual(
      trace.map((m) => [m.kind, m.length]),
    );
  });
});
