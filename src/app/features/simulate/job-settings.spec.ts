import { TestBed } from '@angular/core/testing';
import { EngravingService } from '../../core/engraving.service';
import { PlacementService } from '../../core/placement.service';
import { JobSettings } from './job-settings';

describe('JobSettings', () => {
  function rows(el: HTMLElement) {
    return Array.from(el.querySelectorAll('.row')).map((row) => [
      row.querySelector('dt')?.textContent,
      row.querySelector('dd')?.textContent,
    ]);
  }

  it('reads offset, power, feed rate and side from the services', async () => {
    TestBed.inject(PlacementService).setOffset(12.5, 6);
    TestBed.inject(EngravingService).setPower(65);
    TestBed.inject(EngravingService).setFeedRate(1200);
    const fixture = TestBed.createComponent(JobSettings);
    await fixture.whenStable();
    expect(rows(fixture.nativeElement)).toEqual([
      ['Offset', 'X 12.50 Y 6.00 mm'],
      ['Laser power', '65%'],
      ['Feed rate', '1200 mm/min'],
      ['Side', 'Top'],
    ]);
  });

  it('follows changes', async () => {
    const placement = TestBed.inject(PlacementService);
    const fixture = TestBed.createComponent(JobSettings);
    await fixture.whenStable();
    placement.setSide('bottom');
    placement.nudge(-1.5, 0.25);
    await fixture.whenStable();
    const result = rows(fixture.nativeElement);
    expect(result[0][1]).toBe('X -1.50 Y 0.25 mm');
    expect(result[3][1]).toBe('Bottom');
  });
});
