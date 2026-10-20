import { TestBed } from '@angular/core/testing';
import { MachineService } from '../../core/machine.service';
import { ConsoleLog } from './console-log';

describe('ConsoleLog', () => {
  function setup(consoleLines: string[]) {
    TestBed.inject(MachineService).applyState({ consoleLines });
    const fixture = TestBed.createComponent(ConsoleLog);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('is a labelled log region with an empty note when there is no output', () => {
    const el = setup([]);
    const log = el.querySelector('[role="log"]');
    expect(log?.getAttribute('aria-label')).toBe('Machine console');
    expect(log?.querySelector('app-empty-note')?.textContent?.trim()).toBe('No machine output yet.');
  });

  it('shows only the last four lines', () => {
    const el = setup(['ok', '<Idle>', 'ok', '<Run|1.00,2.00,0.00>', 'ok', '<Run|3.00,2.00,0.00>']);
    const lines = Array.from(el.querySelectorAll('.line')).map((l) => l.textContent);
    expect(lines).toEqual(['ok', '<Run|1.00,2.00,0.00>', 'ok', '<Run|3.00,2.00,0.00>']);
    expect(el.querySelector('app-empty-note')).toBeNull();
  });

  it('never takes focus', () => {
    const el = setup(['ok']);
    expect(el.querySelector('[tabindex]')).toBeNull();
  });
});
