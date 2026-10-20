import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GerberService } from '../../core/gerber.service';
import { parsedProject } from '../../core/gerber.fixtures';
import { ParsedProject } from '../../core/gerber.types';
import { PlacementService } from '../../core/placement.service';
import { OFFSET_ERROR, PlacementSection } from './placement-section';

describe('PlacementSection', () => {
  async function setup(loaded: boolean) {
    const project = signal<ParsedProject | null>(loaded ? parsedProject() : null);
    TestBed.configureTestingModule({ providers: [{ provide: GerberService, useValue: { project } }] });
    const fixture = TestBed.createComponent(PlacementSection);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const placement = TestBed.inject(PlacementService);
    const inputs = () => Array.from(el.querySelectorAll<HTMLInputElement>('input[type="text"]'));
    const type = async (input: HTMLInputElement, text: string) => {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    return { fixture, el, placement, project, inputs, type };
  }

  it('shows the note and no controls while no board is loaded', async () => {
    const { el } = await setup(false);
    expect(el.querySelector('app-empty-note')?.textContent).toContain(
      'Offset, side and mirror are set once a board is loaded.',
    );
    expect(el.querySelector('input, button')).toBeNull();
  });

  it('shows offsets, side and mirror once a board is loaded', async () => {
    const { el, inputs } = await setup(true);
    expect(el.querySelector('app-empty-note')).toBeNull();
    const labels = Array.from(el.querySelectorAll('label.label')).map((l) => l.textContent);
    expect(labels[0]).toContain('Offset X');
    expect(labels[1]).toContain('Offset Y');
    expect(inputs().map((i) => i.value)).toEqual(['0', '0']);
    expect(el.querySelectorAll('.unit')[0].textContent).toContain('mm');
    expect(el.querySelectorAll('[role="radio"]').length).toBe(2);
    expect(el.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false');
    expect(el.textContent).toContain('Mirror for bottom side');
  });

  it('writes valid offsets to the service and keeps the other axis', async () => {
    const { placement, inputs, type } = await setup(true);
    await type(inputs()[0], '12.5');
    await type(inputs()[1], '6');
    expect(placement.offsetX()).toBe(12.5);
    expect(placement.offsetY()).toBe(6);
  });

  it('shows the service offsets when they change elsewhere', async () => {
    const { fixture, placement, inputs } = await setup(true);
    placement.nudge(1.5, -2);
    await fixture.whenStable();
    expect(inputs().map((i) => i.value)).toEqual(['1.5', '-2']);
  });

  it('shows an error and keeps the service value for empty or invalid input', async () => {
    const { el, placement, inputs, type } = await setup(true);
    placement.setOffset(3, 4);
    await type(inputs()[0], 'abc');
    expect(el.textContent).toContain(OFFSET_ERROR);
    expect(inputs()[0].getAttribute('aria-invalid')).toBe('true');
    expect(placement.offsetX()).toBe(3);
    await type(inputs()[0], '');
    expect(el.textContent).toContain(OFFSET_ERROR);
    expect(placement.offsetX()).toBe(3);
    await type(inputs()[0], '7');
    expect(el.textContent).not.toContain(OFFSET_ERROR);
    expect(placement.offsetX()).toBe(7);
    expect(placement.offsetY()).toBe(4);
  });

  it('sets the side from the segmented control', async () => {
    const { fixture, el, placement } = await setup(true);
    const radios = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
    radios[1].click();
    await fixture.whenStable();
    expect(placement.side()).toBe('bottom');
    expect(radios[1].getAttribute('aria-checked')).toBe('true');
  });

  it('toggles mirror', async () => {
    const { fixture, el, placement } = await setup(true);
    el.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
    await fixture.whenStable();
    expect(placement.mirror()).toBe(true);
    expect(el.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true');
  });

  it('goes back to the note when the project is cleared', async () => {
    const { fixture, el, project } = await setup(true);
    project.set(null);
    await fixture.whenStable();
    expect(el.querySelector('app-empty-note')).toBeTruthy();
  });
});
