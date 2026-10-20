import { TestBed } from '@angular/core/testing';
import { GcodeService } from '../../core/gcode.service';
import { CurrentMove, formatCoordinate } from './current-move';

describe('formatCoordinate', () => {
  it('pads the integer part and keeps two decimals', () => {
    expect(formatCoordinate(147.1)).toBe('147.10');
    expect(formatCoordinate(60.4)).toBe('060.40');
    expect(formatCoordinate(0)).toBe('000.00');
  });

  it('keeps the sign of negative values', () => {
    expect(formatCoordinate(-2.5)).toBe('-002.50');
    expect(formatCoordinate(-0.001)).toBe('000.00');
  });
});

describe('CurrentMove', () => {
  function tiles(el: HTMLElement) {
    return Array.from(el.querySelectorAll('app-tile')).map((tile) => [
      tile.querySelector('dt')?.textContent?.trim(),
      tile.querySelector('dd')?.textContent?.replace(/\s+/g, ' ').trim(),
    ]);
  }

  it('shows dashes while there is no position', async () => {
    const fixture = TestBed.createComponent(CurrentMove);
    await fixture.whenStable();
    expect(tiles(fixture.nativeElement)).toEqual([
      ['X', '—'],
      ['Y', '—'],
    ]);
  });

  it('shows the position at the current line', async () => {
    const gcode = TestBed.inject(GcodeService);
    gcode.setLines(['G0 X1 Y2', 'G1 X147.1 Y60.4']);
    gcode.setCurrentLine(2);
    const fixture = TestBed.createComponent(CurrentMove);
    await fixture.whenStable();
    expect(tiles(fixture.nativeElement)).toEqual([
      ['X', '147.10 mm'],
      ['Y', '060.40 mm'],
    ]);
  });
});
