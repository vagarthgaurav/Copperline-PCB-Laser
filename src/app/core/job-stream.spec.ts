import { RX_BUDGET, cleanGcodeLine, nextBatch } from './job-stream';

describe('cleanGcodeLine', () => {
  it('drops comments and space', () => {
    expect(cleanGcodeLine('  G1 X1 Y2 ; move ')).toBe('G1 X1 Y2');
    expect(cleanGcodeLine('G0 (rapid) X0')).toBe('G0  X0');
    expect(cleanGcodeLine('; only a comment')).toBe('');
    expect(cleanGcodeLine('')).toBe('');
  });
});

describe('nextBatch', () => {
  it('sends lines while they fit and skips comment-only lines', () => {
    const batch = nextBatch(['G21', '; note', 'G90', 'M3 S0'], 0, 0);
    expect(batch.text).toBe('G21\nG90\nM3 S0\n');
    expect(batch.sent).toEqual([
      { index: 0, bytes: 4 },
      { index: 2, bytes: 4 },
      { index: 3, bytes: 6 },
    ]);
    expect(batch.cursor).toBe(4);
  });

  it('stops at the budget and resumes from the cursor', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `G1 X${i}.000 Y${i}.000`);
    const first = nextBatch(lines, 0, 0);
    expect(first.sent.reduce((sum, line) => sum + line.bytes, 0)).toBeLessThanOrEqual(RX_BUDGET);
    expect(first.cursor).toBeLessThan(lines.length);
    expect(nextBatch(lines, first.cursor, RX_BUDGET).text).toBe('');
    const second = nextBatch(lines, first.cursor, 0);
    expect(second.sent[0].index).toBe(first.cursor);
  });

  it('sends an over-long line when nothing else is in flight', () => {
    const long = `G1 ${'X1 '.repeat(60)}`;
    expect(nextBatch([long], 0, 0).sent).toHaveLength(1);
    expect(nextBatch([long], 0, 10).sent).toHaveLength(0);
  });

  it('returns an empty batch at the end of the program', () => {
    expect(nextBatch(['G1 X1'], 1, 0)).toEqual({ text: '', sent: [], cursor: 1 });
  });
});
