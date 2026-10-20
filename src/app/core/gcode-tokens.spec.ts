import { tokenizeGcodeLine } from './gcode-tokens';

describe('tokenizeGcodeLine', () => {
  it('marks G and M words', () => {
    expect(tokenizeGcodeLine('G1 X10 Y5.5 F1200')).toEqual([
      { kind: 'word', text: 'G1' },
      { kind: 'text', text: ' X10 Y5.5 F1200' },
    ]);
    expect(tokenizeGcodeLine('M3 S650')).toEqual([
      { kind: 'word', text: 'M3' },
      { kind: 'text', text: ' S650' },
    ]);
  });

  it('marks several words on one line', () => {
    expect(tokenizeGcodeLine('G21 G90').map((t) => t.kind)).toEqual(['word', 'text', 'word']);
  });

  it('marks everything after a semicolon as a comment', () => {
    expect(tokenizeGcodeLine('G0 X1 ; move G1 here')).toEqual([
      { kind: 'word', text: 'G0' },
      { kind: 'text', text: ' X1 ' },
      { kind: 'comment', text: '; move G1 here' },
    ]);
    expect(tokenizeGcodeLine('; header')).toEqual([{ kind: 'comment', text: '; header' }]);
  });

  it('does not treat other letters as words', () => {
    expect(tokenizeGcodeLine('X10 Y20 S500')).toEqual([{ kind: 'text', text: 'X10 Y20 S500' }]);
  });

  it('returns no tokens for an empty line', () => {
    expect(tokenizeGcodeLine('')).toEqual([]);
  });

  it('tolerates lower case', () => {
    expect(tokenizeGcodeLine('g1 x2')[0]).toEqual({ kind: 'word', text: 'g1' });
  });

  it.each(['G1 X10 Y5 F1200 ; engrave', '  m3  s100;c', ';', 'G0X1Y2', '(note) G1 X1'])(
    'preserves every character of %j',
    (line) => {
      expect(
        tokenizeGcodeLine(line)
          .map((t) => t.text)
          .join(''),
      ).toBe(line);
    },
  );
});
