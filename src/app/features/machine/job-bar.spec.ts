import { TestBed } from '@angular/core/testing';
import { GcodeService } from '../../core/gcode.service';
import { MachineService } from '../../core/machine.service';
import { JobBar } from './job-bar';

const JOB = { name: 'board_v3.zip', side: 'Top' as const, line: 412, lines: 1284, etaSeconds: 192 };

describe('JobBar', () => {
  function setup(state: Parameters<MachineService['applyState']>[0], gcodeLines: string[] = ['G1 X1 Y1']) {
    const machine = TestBed.inject(MachineService);
    TestBed.inject(GcodeService).setLines(gcodeLines);
    machine.applyState(state);
    const fixture = TestBed.createComponent(JobBar);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes(label)) as HTMLButtonElement;
    return { machine, el, button };
  }

  it('disables every control and shows no banner when disconnected', () => {
    const { el, button } = setup({ connection: 'disconnected' });
    for (const label of ['Pause', 'Stop', 'Home', 'Start engraving']) {
      expect(button(label).disabled, label).toBe(true);
    }
    expect(el.querySelector('app-banner')).toBeNull();
  });

  it('enables Start and Home when connected and idle with G-code', () => {
    const { button } = setup({ connection: 'connected', jobState: 'idle' });
    expect(button('Start engraving').disabled).toBe(false);
    expect(button('Home').disabled).toBe(false);
    expect(button('Pause').disabled).toBe(true);
    expect(button('Stop').disabled).toBe(true);
  });

  it('keeps Start disabled and warns when connected without G-code', () => {
    const { el, button } = setup({ connection: 'connected', jobState: 'idle' }, []);
    expect(button('Start engraving').disabled).toBe(true);
    expect(el.querySelector('app-banner')?.textContent).toContain('There is no G-code to engrave');
  });

  it('while running enables Pause and Stop and disables Start and Home', () => {
    const { button } = setup({ connection: 'connected', jobState: 'running', job: JOB });
    expect(button('Pause').disabled).toBe(false);
    expect(button('Stop').disabled).toBe(false);
    expect(button('Start engraving').disabled).toBe(true);
    expect(button('Home').disabled).toBe(true);
  });

  it('labels the pause button Resume while paused', () => {
    const { el, button } = setup({ connection: 'connected', jobState: 'paused', job: JOB });
    expect(button('Resume').disabled).toBe(false);
    expect(Array.from(el.querySelectorAll('button')).some((b) => b.textContent?.includes('Pause'))).toBe(false);
    expect(button('Stop').disabled).toBe(false);
  });

  it('exposes the progress numbers on the progress bar and repeats them as text', () => {
    const { el } = setup({ connection: 'connected', jobState: 'running', job: JOB });
    const bar = el.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute('aria-label')).toBe('Job progress');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('1284');
    expect(bar.getAttribute('aria-valuenow')).toBe('412');
    expect((bar.querySelector('i') as HTMLElement).style.width).toBe('32%');
    expect(el.querySelector('.text')?.textContent).toContain('Line 412 of 1,284 · ETA 03:12');
    expect(el.querySelector('.text')?.textContent).toContain('32%');
  });

  it('shows an empty bar with a plain message when there is no job', () => {
    const { el } = setup({ connection: 'connected', job: null });
    const bar = el.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
    expect(el.querySelector('.text')?.textContent).toContain('No job running.');
  });

  it('calls the service methods from the buttons', () => {
    const { machine, button } = setup({ connection: 'connected', jobState: 'running', job: JOB });
    const pause = vi.spyOn(machine, 'pause');
    const stop = vi.spyOn(machine, 'stop');
    button('Pause').click();
    button('Stop').click();
    expect(pause).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('calls start and home when idle', () => {
    const { machine, button } = setup({ connection: 'connected', jobState: 'idle' });
    const start = vi.spyOn(machine, 'start');
    const home = vi.spyOn(machine, 'home');
    button('Start engraving').click();
    button('Home').click();
    expect(start).toHaveBeenCalledTimes(1);
    expect(home).toHaveBeenCalledTimes(1);
  });

  it('has exactly one primary button', () => {
    const { el } = setup({ connection: 'connected' });
    expect(el.querySelectorAll('button[data-variant="primary"]').length).toBe(1);
  });
});
