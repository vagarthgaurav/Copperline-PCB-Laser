import { TestBed } from '@angular/core/testing';
import { MachineService, jogCommand } from '../../core/machine.service';
import { JogSection } from './jog-section';

describe('jogCommand', () => {
  it('builds a relative metric jog', () => {
    expect(jogCommand('X', 10, 1000)).toBe('$J=G21G91X10F1000');
    expect(jogCommand('Y', -0.1, 600)).toBe('$J=G21G91Y-0.1F600');
  });
});

describe('JogSection', () => {
  function setup(state: Parameters<MachineService['applyState']>[0]) {
    const machine = TestBed.inject(MachineService);
    machine.applyState(state);
    const send = vi.spyOn(machine, 'send').mockResolvedValue();
    const fixture = TestBed.createComponent(JogSection);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const button = (text: string) =>
      Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement;
    return { machine, send, fixture, el, button };
  }

  it('disables every button while disconnected', () => {
    const { el } = setup({});
    expect(Array.from(el.querySelectorAll('.pad button')).every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('disables every button while a job runs', () => {
    const { el } = setup({ connection: 'connected', jobState: 'running' });
    expect(Array.from(el.querySelectorAll('.pad button')).every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('jogs by the chosen step and feed', () => {
    const { machine, send, fixture, button } = setup({ connection: 'connected' });
    button('X+').click();
    expect(send).toHaveBeenLastCalledWith('$J=G21G91X1F1000');
    machine.setJogStep(10);
    machine.setJogFeed(500);
    fixture.detectChanges();
    button('Y-').click();
    expect(send).toHaveBeenLastCalledWith('$J=G21G91Y-10F500');
  });

  it('homes all axes with $H and X or Y alone with $HX and $HY', () => {
    const { send, button } = setup({ connection: 'connected' });
    button('Home all').click();
    expect(send).toHaveBeenLastCalledWith('$H');
    button('Home X').click();
    expect(send).toHaveBeenLastCalledWith('$HX');
    button('Home Y').click();
    expect(send).toHaveBeenLastCalledWith('$HY');
  });

  it('gives each jog button an accessible name', () => {
    const { el } = setup({ connection: 'connected' });
    expect(el.querySelector('[aria-label="Jog X- by 1 mm"]')).not.toBeNull();
  });
});
