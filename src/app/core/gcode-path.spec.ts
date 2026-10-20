import { traceGcode } from './gcode-path';

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
