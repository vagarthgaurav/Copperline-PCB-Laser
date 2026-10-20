import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EngravingService } from '../../core/engraving.service';
import { GerberService } from '../../core/gerber.service';
import { parsedProject } from '../../core/gerber.fixtures';
import { ParsedProject } from '../../core/gerber.types';
import { EngravingSection, FEED_RATE_ERROR } from './engraving-section';

describe('EngravingSection', () => {
  async function setup(loaded: boolean) {
    const project = signal<ParsedProject | null>(loaded ? parsedProject() : null);
    TestBed.configureTestingModule({ providers: [{ provide: GerberService, useValue: { project } }] });
    const fixture = TestBed.createComponent(EngravingSection);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const engraving = TestBed.inject(EngravingService);
    const feed = () => el.querySelector<HTMLInputElement>('input[type="text"]')!;
    const slider = () => el.querySelector<HTMLInputElement>('input[type="range"]')!;
    const type = async (input: HTMLInputElement, text: string) => {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    return { fixture, el, engraving, feed, slider, type };
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
});
