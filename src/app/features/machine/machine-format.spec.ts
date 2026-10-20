import { formatCoordinate, formatCount, formatEta, formatLineOf } from './machine-format';

describe('machine formatting', () => {
  it('zero pads coordinates to two decimals', () => {
    expect(formatCoordinate(72.5)).toBe('072.50');
    expect(formatCoordinate(0)).toBe('000.00');
    expect(formatCoordinate(123.456)).toBe('123.46');
  });

  it('keeps the sign of negative coordinates', () => {
    expect(formatCoordinate(-4.2)).toBe('-004.20');
    expect(formatCoordinate(-0.001)).toBe('000.00');
  });

  it('shows an em dash for unknown coordinates', () => {
    expect(formatCoordinate(null)).toBe('—');
    expect(formatCoordinate(undefined)).toBe('—');
    expect(formatCoordinate(Number.NaN)).toBe('—');
  });

  it('formats ETA as mm:ss', () => {
    expect(formatEta(192)).toBe('03:12');
    expect(formatEta(0)).toBe('00:00');
    expect(formatEta(7500)).toBe('125:00');
    expect(formatEta(-5)).toBe('00:00');
  });

  it('formats line counts', () => {
    expect(formatCount(1284)).toBe('1,284');
    expect(formatLineOf(412, 1284)).toBe('Line 412 of 1,284');
  });
});
