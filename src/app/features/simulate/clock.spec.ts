import { formatClock } from './clock';

describe('formatClock', () => {
  it('pads minutes and seconds', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(588)).toBe('09:48');
    expect(formatClock(192)).toBe('03:12');
  });

  it('rounds to whole seconds and lets minutes grow past 99', () => {
    expect(formatClock(59.6)).toBe('01:00');
    expect(formatClock(6000)).toBe('100:00');
  });

  it('treats negative and non-finite values as zero', () => {
    expect(formatClock(-5)).toBe('00:00');
    expect(formatClock(Number.NaN)).toBe('00:00');
  });
});
