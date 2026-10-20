import { TestBed } from '@angular/core/testing';
import { GcodeService } from '../../core/gcode.service';
import { DryRunSection } from './dry-run-section';

describe('DryRunSection', () => {
  function setup() {
    const fixture = TestBed.createComponent(DryRunSection);
    return { fixture, el: fixture.nativeElement as HTMLElement, gcode: TestBed.inject(GcodeService) };
  }

  it('explains the dry run and shows the empty note without G-code', async () => {
    const { fixture, el } = setup();
    await fixture.whenStable();
    expect(el.textContent).toContain('Replays the job on the 3D board. Nothing is sent to the machine.');
    expect(el.querySelector('app-empty-note')?.textContent).toContain('Nothing to simulate yet');
    expect(el.querySelector('app-tile')).toBeNull();
  });

  it('shows total time and the formatted line count', async () => {
    const { fixture, el, gcode } = setup();
    gcode.setLines(['G0 X0 Y0', 'G1 X60 Y0 F1200', ...Array.from({ length: 1500 }, () => '; note')]);
    await fixture.whenStable();
    const tiles = Array.from(el.querySelectorAll('app-tile')).map((tile) => ({
      label: tile.querySelector('dt')?.textContent?.trim(),
      value: tile.querySelector('dd')?.textContent?.trim(),
    }));
    // G0 over 0 mm plus 60 mm at 1200 mm/min is 3 s.
    expect(tiles).toEqual([
      { label: 'Total time', value: '00:03' },
      { label: 'Lines', value: '1,502' },
    ]);
    expect(el.querySelector('app-empty-note')).toBeNull();
  });
});
