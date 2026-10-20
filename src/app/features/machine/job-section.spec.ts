import { TestBed } from '@angular/core/testing';
import { MachineService } from '../../core/machine.service';
import { JobSection } from './job-section';

describe('JobSection', () => {
  function setup(state: Parameters<MachineService['applyState']>[0]) {
    TestBed.inject(MachineService).applyState(state);
    const fixture = TestBed.createComponent(JobSection);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the empty note when there is no job', () => {
    const el = setup({ job: null });
    expect(el.querySelector('app-empty-note')?.textContent?.trim()).toBe(
      'No job running. Load a Gerber in Design to prepare one.',
    );
  });

  it('summarises the job with its line and ETA', () => {
    const el = setup({ job: { name: 'board_v3.zip', side: 'Top', line: 412, lines: 1284, etaSeconds: 192 } });
    expect(el.querySelector('app-empty-note')).toBeNull();
    expect(el.textContent).toContain('board_v3.zip · Top side');
    expect(el.textContent).toContain('Line 412 of 1,284 · ETA 03:12');
  });
});
