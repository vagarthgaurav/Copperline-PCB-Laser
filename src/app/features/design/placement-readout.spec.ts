import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GerberService } from '../../core/gerber.service';
import { parsedProject } from '../../core/gerber.fixtures';
import { ParsedProject } from '../../core/gerber.types';
import { PlacementService } from '../../core/placement.service';
import { PlacementReadout, formatOffset } from './placement-readout';

describe('formatOffset', () => {
  it.each([
    [12.5, '012.50'],
    [6, '006.00'],
    [0, '000.00'],
    [-0.001, '000.00'],
    [-3.456, '-003.46'],
    [123.456, '123.46'],
    [1234, '1234.00'],
  ])('formats %d as %s', (value, text) => {
    expect(formatOffset(value)).toBe(text);
  });
});

describe('PlacementReadout', () => {
  async function setup(loaded: boolean) {
    const project = signal<ParsedProject | null>(loaded ? parsedProject() : null);
    TestBed.configureTestingModule({ providers: [{ provide: GerberService, useValue: { project } }] });
    const fixture = TestBed.createComponent(PlacementReadout);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement, placement: TestBed.inject(PlacementService) };
  }

  it('shows the empty note when nothing is loaded', async () => {
    const { el } = await setup(false);
    expect(el.querySelector('app-empty-note')?.textContent).toContain('No board placed.');
    expect(el.querySelector('app-tile')).toBeNull();
  });

  it('shows both offsets as padded tiles with the mm unit and the help line', async () => {
    const { fixture, el, placement } = await setup(true);
    placement.setOffset(12.5, 6);
    await fixture.whenStable();
    const tiles = Array.from(el.querySelectorAll('app-tile'));
    expect(tiles.map((t) => t.querySelector('dt')?.textContent)).toEqual(['Offset X', 'Offset Y']);
    expect(tiles[0].querySelector('dd')?.textContent).toContain('012.50');
    expect(tiles[1].querySelector('dd')?.textContent).toContain('006.00');
    expect(tiles[0].querySelector('.unit')?.textContent).toBe('mm');
    expect(el.textContent).toContain('Offset is added to every move in the exported G-code.');
  });
});
