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

  it('shows every line, marking sent commands and status reports', () => {
    const el = setup(['> $I', '[VER:1.1f]', '<Idle|MPos:0,0,0>', 'ok']);
    const lines = Array.from(el.querySelectorAll('.line'));
    expect(lines.map((l) => l.textContent)).toEqual(['> $I', '[VER:1.1f]', '<Idle|MPos:0,0,0>', 'ok']);
    expect(lines[0].classList.contains('sent')).toBe(true);
    expect(lines[2].classList.contains('status')).toBe(true);
    expect(el.querySelector('app-empty-note')).toBeNull();
  });

  it('is keyboard-scrollable and disables the command line while disconnected', () => {
    const el = setup(['ok']);
    expect(el.querySelector('[role="log"]')?.getAttribute('tabindex')).toBe('0');
    expect((el.querySelector('input') as HTMLInputElement).disabled).toBe(true);
    expect((el.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('sends the typed command on submit and clears the field', () => {
    const machine = TestBed.inject(MachineService);
    machine.applyState({ connection: 'connected' });
    const send = vi.spyOn(machine, 'send').mockResolvedValue();
    const fixture = TestBed.createComponent(ConsoleLog);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input') as HTMLInputElement;
    input.value = '$$';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(send).toHaveBeenCalledWith('$$');
    expect(input.value).toBe('');
  });
});
