import { TestBed } from '@angular/core/testing';
import { GcodeService } from '../../core/gcode.service';
import { SimulationService } from '../../core/simulation.service';
import { SimulationControls } from './simulation-controls';

// 600 mm at 1200 mm/min is 30 s, spread over 4 lines.
const LINES = ['G0 X0 Y0', 'G1 X200 Y0 F1200', 'G1 X200 Y200', 'G1 X0 Y200'];

describe('SimulationControls', () => {
  function setup(lines: readonly string[] = LINES) {
    TestBed.inject(GcodeService).setLines(lines);
    const fixture = TestBed.createComponent(SimulationControls);
    const el = fixture.nativeElement as HTMLElement;
    const simulation = TestBed.inject(SimulationService);
    const button = (label: string) => el.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
    const range = () => el.querySelector<HTMLInputElement>('input[type=range]')!;
    const radios = () => Array.from(el.querySelectorAll<HTMLInputElement>('input[type=radio]'));
    return { fixture, el, simulation, button, range, radios };
  }

  afterEach(() => TestBed.inject(SimulationService).pause());

  it('always shows the notice', async () => {
    const { fixture, el } = setup([]);
    await fixture.whenStable();
    expect(el.querySelector('.note')?.textContent).toBe('Simulating — nothing is sent to the machine');
  });

  it('disables every control when there is no G-code', async () => {
    const { fixture, el } = setup([]);
    await fixture.whenStable();
    const controls = Array.from(el.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input'));
    expect(controls.length).toBe(9);
    expect(controls.every((control) => control.disabled)).toBe(true);
  });

  it('starts paused at 1x with restart and step back disabled', async () => {
    const { fixture, el, simulation, button, radios } = setup();
    await fixture.whenStable();
    expect(simulation.playing()).toBe(false);
    expect(button('Play').getAttribute('aria-pressed')).toBe('false');
    expect(button('Restart').disabled).toBe(true);
    expect(button('Step back').disabled).toBe(true);
    expect(button('Step forward').disabled).toBe(false);
    expect(radios().map((radio) => radio.checked)).toEqual([true, false, false, false]);
    expect(el.querySelector('.time')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('00:00 / 00:30');
  });

  it('swaps the label, icon state and aria-pressed with play and pause', async () => {
    const { fixture, simulation, button } = setup();
    await fixture.whenStable();
    button('Play').click();
    await fixture.whenStable();
    expect(simulation.playing()).toBe(true);
    expect(button('Pause').getAttribute('aria-pressed')).toBe('true');
    button('Pause').click();
    await fixture.whenStable();
    expect(simulation.playing()).toBe(false);
    expect(button('Play')).toBeTruthy();
  });

  it('steps, restarts and enables the left-hand buttons once moved', async () => {
    const { fixture, simulation, button } = setup();
    await fixture.whenStable();
    button('Step forward').click();
    await fixture.whenStable();
    expect(simulation.position()).toBeGreaterThan(0);
    expect(button('Restart').disabled).toBe(false);
    expect(button('Step back').disabled).toBe(false);
    button('Restart').click();
    await fixture.whenStable();
    expect(simulation.position()).toBe(0);
    expect(button('Restart').disabled).toBe(true);
  });

  it('seeks from the scrubber and describes its value', async () => {
    const { fixture, el, simulation, range } = setup();
    await fixture.whenStable();
    expect(range().getAttribute('aria-label')).toBe('Simulation position');
    expect(range().max).toBe('30');
    range().value = '12';
    range().dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(simulation.position()).toBe(12);
    expect(range().getAttribute('aria-valuetext')).toBe('00:12 of 00:30');
    expect(el.querySelector('.time')?.getAttribute('aria-live')).toBe('off');
  });

  it('sets the speed from the radio group', async () => {
    const { fixture, el, simulation, radios } = setup();
    await fixture.whenStable();
    const group = el.querySelector('[role=radiogroup]')!;
    expect(group.getAttribute('aria-label')).toBe('Playback speed');
    expect(Array.from(group.querySelectorAll('label')).map((l) => l.textContent?.trim())).toEqual([
      '1×',
      '4×',
      '16×',
      '64×',
    ]);
    radios()[2].click();
    await fixture.whenStable();
    expect(simulation.speed()).toBe(16);
    expect(radios().map((radio) => radio.checked)).toEqual([false, false, true, false]);
  });
});
