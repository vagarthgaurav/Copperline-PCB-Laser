import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EngravingService } from '../../core/engraving.service';
import { GcodeService } from '../../core/gcode.service';
import { GerberService } from '../../core/gerber.service';
import { parsedProject } from '../../core/gerber.fixtures';
import { ParsedProject } from '../../core/gerber.types';
import { EngravingSection, FEED_RATE_ERROR, OVERLAP_ERROR, PASSES_ERROR, SPOT_SIZE_ERROR } from './engraving-section';

describe('EngravingSection', () => {
  async function setup(loaded: boolean) {
    const generating = signal(false);
    const stale = signal(false);
    const project = signal<ParsedProject | null>(loaded ? parsedProject() : null);
    TestBed.configureTestingModule({ providers: [
        { provide: GerberService, useValue: { project } },
        { provide: GcodeService, useValue: { generating, stale, generate: vi.fn().mockResolvedValue(undefined) } },
      ],
    });
    const fixture = TestBed.createComponent(EngravingSection);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const engraving = TestBed.inject(EngravingService);
    const texts = () => Array.from(el.querySelectorAll<HTMLInputElement>('input[type="text"]'));
    const feed = () => texts()[0];
    const spot = () => texts()[1];
    const passes = () => texts()[2];
    const overlap = () => texts()[3];
    const slider = () => el.querySelector<HTMLInputElement>('input[type="range"]')!;
    const type = async (input: HTMLInputElement, text: string) => {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    const gcode = TestBed.inject(GcodeService);
    const button = () => el.querySelector<HTMLButtonElement>('button.generate');
    return { fixture, el, gcode, generating, stale, button, engraving, feed, spot, passes, overlap, slider, type };
  }

  it('shows the note and no controls while no board is loaded', async () => {
    const { el } = await setup(false);
    expect(el.querySelector('app-empty-note')?.textContent).toContain(
      'Set laser power and feed once a board is loaded.',
    );
    expect(el.querySelector('input')).toBeNull();
  });

  it('shows power and feed rate from the service with their units', async () => {
    const { el, feed, slider, engraving } = await setup(true);
    expect(slider().value).toBe(String(engraving.power()));
    expect(slider().min).toBe('0');
    expect(slider().max).toBe('100');
    expect(feed().value).toBe(String(engraving.feedRate()));
    expect(el.textContent).toContain('Laser power');
    expect(el.textContent).toContain('Feed rate');
    expect(el.textContent).toContain('mm/min');
    expect(el.textContent).toContain(`${engraving.power()}%`);
  });

  it('writes slider changes to the service', async () => {
    const { slider, engraving, type } = await setup(true);
    await type(slider(), '40');
    expect(engraving.power()).toBe(40);
  });

  it('writes a valid feed rate to the service', async () => {
    const { el, feed, engraving, type } = await setup(true);
    await type(feed(), '900');
    expect(engraving.feedRate()).toBe(900);
    expect(el.textContent).not.toContain(FEED_RATE_ERROR);
  });

  it.each(['', 'fast', '0', '-5', '12.5'])('rejects %j as a feed rate', async (text) => {
    const { el, feed, engraving, type } = await setup(true);
    const before = engraving.feedRate();
    await type(feed(), text);
    expect(el.textContent).toContain(FEED_RATE_ERROR);
    expect(feed().getAttribute('aria-invalid')).toBe('true');
    expect(engraving.feedRate()).toBe(before);
  });

  it('shows spot size, passes and overlap (as a percentage) from the service', async () => {
    const { el, spot, passes, overlap, engraving } = await setup(true);
    expect(spot().value).toBe('0.1');
    expect(passes().value).toBe('1');
    expect(overlap().value).toBe('30');
    expect(el.textContent).toContain('Spot size');
    expect(el.textContent).toContain('Isolation passes');
    expect(el.textContent).toContain('Pass overlap');
    expect(engraving.passOverlap()).toBe(0.3);
  });

  it('writes valid spot size, passes and overlap to the service', async () => {
    const { el, spot, passes, overlap, engraving, type } = await setup(true);
    await type(spot(), '0.05');
    await type(passes(), '4');
    await type(overlap(), '50');
    expect(engraving.spotDiameter()).toBe(0.05);
    expect(engraving.isolationPasses()).toBe(4);
    expect(engraving.passOverlap()).toBe(0.5);
    expect(el.textContent).not.toContain(SPOT_SIZE_ERROR);
    expect(el.textContent).not.toContain(PASSES_ERROR);
    expect(el.textContent).not.toContain(OVERLAP_ERROR);
  });

  it.each(['', 'thin', '0', '0.005', '1.5'])('rejects %j as a spot size', async (text) => {
    const { el, spot, engraving, type } = await setup(true);
    await type(spot(), text);
    expect(el.textContent).toContain(SPOT_SIZE_ERROR);
    expect(spot().getAttribute('aria-invalid')).toBe('true');
    expect(engraving.spotDiameter()).toBe(0.1);
  });

  it.each(['', 'many', '0', '21', '2.5'])('rejects %j as a pass count', async (text) => {
    const { el, passes, engraving, type } = await setup(true);
    await type(passes(), text);
    expect(el.textContent).toContain(PASSES_ERROR);
    expect(passes().getAttribute('aria-invalid')).toBe('true');
    expect(engraving.isolationPasses()).toBe(1);
  });

  it.each(['', 'lots', '-1', '91'])('rejects %j as a pass overlap', async (text) => {
    const { el, overlap, engraving, type } = await setup(true);
    await type(overlap(), text);
    expect(el.textContent).toContain(OVERLAP_ERROR);
    expect(overlap().getAttribute('aria-invalid')).toBe('true');
    expect(engraving.passOverlap()).toBe(0.3);
  });

  it('accepts 0 and 90 % overlap', async () => {
    const { overlap, engraving, type } = await setup(true);
    await type(overlap(), '90');
    expect(engraving.passOverlap()).toBe(0.9);
    await type(overlap(), '0');
    expect(engraving.passOverlap()).toBe(0);
  });

  it('has no generate button while no board is loaded', async () => {
    const { button } = await setup(false);
    expect(button()).toBeNull();
  });

  it('renders a Generate G-code button that calls generate', async () => {
    const { button, gcode } = await setup(true);
    const generate = gcode.generate;
    expect(button()?.textContent?.trim()).toBe('Generate G-code');
    button()!.click();
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('disables the button and shows busy text while generating', async () => {
    const { fixture, button, generating } = await setup(true);
    generating.set(true);
    await fixture.whenStable();
    expect(button()!.disabled).toBe(true);
    expect(button()!.textContent?.trim()).toBe('Generating…');
  });

  it('disables the button while a field is invalid', async () => {
    const { button, feed, type } = await setup(true);
    await type(feed(), 'fast');
    expect(button()!.disabled).toBe(true);
    await type(feed(), '900');
    expect(button()!.disabled).toBe(false);
  });

  it('shows the stale note only when the G-code is stale', async () => {
    const { el, fixture, stale } = await setup(true);
    expect(el.querySelector('.stale')).toBeNull();
    stale.set(true);
    await fixture.whenStable();
    expect(el.querySelector('.stale')?.textContent).toContain(
      'Settings changed since the last G-code. Generate again.',
    );
  });
});
