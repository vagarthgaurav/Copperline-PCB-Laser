import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GerberService } from '../../core/gerber.service';
import { parsedProject } from '../../core/gerber.fixtures';
import { ParsedProject } from '../../core/gerber.types';
import { PlacementService } from '../../core/placement.service';
import { FREE_PLACEMENT_NOTE, OFFSET_ERROR, PlacementSection } from './placement-section';

describe('PlacementSection', () => {
  const templateBoard = {
    bounds: { minX: 126, minY: -114, maxX: 164, maxY: -76 },
    source: 'outline',
    width: 38,
    height: 38,
  } as const;
  const templateHoles = [
    { x: 125, y: -75, diameter: 2.2 },
    { x: 125, y: -115, diameter: 2.2 },
    { x: 165, y: -75, diameter: 2.2 },
    { x: 165, y: -115, diameter: 2.2 },
  ];

  async function setup(loaded: boolean, overrides: Partial<ParsedProject> = {}) {
    const project = signal<ParsedProject | null>(loaded ? parsedProject(overrides) : null);
    TestBed.configureTestingModule({
      providers: [{ provide: GerberService, useValue: { project } }],
    });
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
    const commit = async (input: HTMLInputElement) => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await fixture.whenStable();
    };
    return { fixture, el, placement, project, inputs, type, commit };
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
    const { placement, inputs, type, commit } = await setup(true);
    await type(inputs()[0], '12.5');
    expect(placement.offsetX()).toBe(0);
    await commit(inputs()[0]);
    await type(inputs()[1], '6');
    await commit(inputs()[1]);
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
    const { el, placement, inputs, type, commit } = await setup(true);
    placement.setOffset(3, 4);
    await type(inputs()[0], 'abc');
    await commit(inputs()[0]);
    expect(el.textContent).toContain(OFFSET_ERROR);
    expect(inputs()[0].getAttribute('aria-invalid')).toBe('true');
    expect(placement.offsetX()).toBe(3);
    await type(inputs()[0], '');
    await commit(inputs()[0]);
    expect(el.textContent).toContain(OFFSET_ERROR);
    expect(placement.offsetX()).toBe(3);
    await type(inputs()[0], '7');
    await commit(inputs()[0]);
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

  it('says placement is free when the design has no peg holes', async () => {
    const { el } = await setup(true);
    expect(el.querySelector('.status')?.textContent).toBe(FREE_PLACEMENT_NOTE);
  });

  describe('on the peg grid', () => {
    const snapped = { board: templateBoard, pegHoles: templateHoles };

    it('says the board snaps to the peg grid', async () => {
      const { el, placement } = await setup(true, snapped);
      expect(el.querySelector('.status')?.textContent).toBe('Snapped to the 10 mm peg grid');
      expect(placement.snapPitch()).toBe(10);
    });

    it('applies a typed offset when the field is committed and shows the snapped value', async () => {
      const { placement, inputs, type, commit } = await setup(true, snapped);
      expect(inputs().map((i) => i.value)).toEqual(['1', '1']);
      await type(inputs()[0], '33');
      expect(placement.offsetX()).toBe(1);
      expect(inputs()[0].value).toBe('33');
      await commit(inputs()[0]);
      expect(placement.offsetX()).toBe(31);
      expect(inputs()[0].value).toBe('31');
      await type(inputs()[1], '4.4');
      await commit(inputs()[1]);
      expect(placement.offsetY()).toBe(1);
      expect(inputs()[1].value).toBe('1');
    });

    it('shows the snapped value even when it equals the previous offset', async () => {
      const { placement, inputs, type, commit } = await setup(true, snapped);
      await type(inputs()[0], '3.3');
      await commit(inputs()[0]);
      expect(placement.offsetX()).toBe(1);
      expect(inputs()[0].value).toBe('1');
    });
  });

  describe('on the floor', () => {
    const blank = { minX: 122, minY: -118, maxX: 168, maxY: -72 };

    it('shows the clamped value after committing a far-out number (free placement)', async () => {
      const { placement, inputs, type, commit } = await setup(true, {
        board: templateBoard,
        blank,
      });
      await type(inputs()[0], '9999');
      expect(placement.offsetX()).toBe(0);
      expect(inputs()[0].value).toBe('9999');
      await commit(inputs()[0]);
      // Floor maxX 480 minus the blank's right edge at +42 from the offset.
      expect(placement.offsetX()).toBe(438);
      expect(inputs()[0].value).toBe('438');
      await type(inputs()[1], '-500');
      await commit(inputs()[1]);
      expect(placement.offsetY()).toBe(-16);
      expect(inputs()[1].value).toBe('-16');
    });

    it('shows the clamped, snapped value after committing a far-out number on the peg grid', async () => {
      const { placement, inputs, type, commit } = await setup(true, {
        board: templateBoard,
        blank,
        pegHoles: templateHoles,
      });
      await type(inputs()[0], '-500');
      await commit(inputs()[0]);
      expect(placement.offsetX()).toBe(-9);
      expect(inputs()[0].value).toBe('-9');
    });
  });

  it('goes back to the note when the project is cleared', async () => {
    const { fixture, el, project } = await setup(true);
    project.set(null);
    await fixture.whenStable();
    expect(el.querySelector('app-empty-note')).toBeTruthy();
  });
});
