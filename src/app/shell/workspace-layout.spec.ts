import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PANEL_WIDTHS_STORAGE_KEY, PanelWidthService } from '../core/panel-width.service';
import { PanelSection } from '../ui/panel/panel-section';
import { WorkspaceLayout } from './workspace-layout';

@Component({
  imports: [WorkspaceLayout, PanelSection],
  template: `
    <app-workspace-layout leftLabel="Left things" rightLabel="Right things">
      <app-panel-section left heading="Alpha" />
      <app-panel-section left heading="Beta" />
      <p class="centre">Centre content</p>
      <app-panel-section right heading="Gamma" />
    </app-workspace-layout>
  `,
})
class Host {}

describe('WorkspaceLayout', () => {
  beforeEach(() => localStorage.removeItem(PANEL_WIDTHS_STORAGE_KEY));
  afterEach(() => vi.unstubAllGlobals());

  async function setup() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('projects left, centre and right content into their slots', async () => {
    const el = await setup();
    const [left, right] = Array.from(el.querySelectorAll('app-panel'));
    expect(Array.from(left.querySelectorAll('h2')).map((h) => h.textContent)).toEqual([
      'Alpha',
      'Beta',
    ]);
    expect(Array.from(right.querySelectorAll('h2')).map((h) => h.textContent)).toEqual(['Gamma']);
    expect(el.querySelector('main')?.textContent).toContain('Centre content');
    expect(el.querySelector('main')?.querySelector('h2')).toBeNull();
  });

  it('exposes two labelled complementary landmarks and one main', async () => {
    const el = await setup();
    const panels = Array.from(el.querySelectorAll('app-panel'));
    expect(panels.map((p) => p.getAttribute('role'))).toEqual(['complementary', 'complementary']);
    expect(panels.map((p) => p.getAttribute('aria-label'))).toEqual([
      'Left things',
      'Right things',
    ]);
    expect(el.querySelectorAll('main').length).toBe(1);
  });

  it('orders left, main, right in the DOM', async () => {
    const el = await setup();
    const tags = Array.from(el.querySelector('app-workspace-layout')!.children).map((c) =>
      c.tagName.toLowerCase(),
    );
    expect(tags).toEqual([
      'app-panel',
      'app-panel-resizer',
      'main',
      'app-panel-resizer',
      'app-panel',
    ]);
  });

  it('renders a labelled separator for each panel that controls it', async () => {
    const el = await setup();
    const separators = Array.from(el.querySelectorAll('[role="separator"]'));
    const [left, right] = Array.from(el.querySelectorAll('app-panel'));
    expect(separators.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Resize left panel',
      'Resize right panel',
    ]);
    expect(separators.map((s) => s.getAttribute('aria-controls'))).toEqual([left.id, right.id]);
    expect(left.id).not.toBe('');
    expect(separators.map((s) => s.getAttribute('aria-valuenow'))).toEqual(['320', '320']);
  });

  it('lays out five columns from the shared panel widths', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const layout = (fixture.nativeElement as HTMLElement).querySelector(
      'app-workspace-layout',
    ) as HTMLElement;
    expect(layout.style.gridTemplateColumns).toBe('320px 16px minmax(0, 1fr) 16px 320px');

    const widths = TestBed.inject(PanelWidthService);
    widths.setLeft(400);
    widths.setRight(260);
    await fixture.whenStable();
    expect(layout.style.gridTemplateColumns).toBe('400px 16px minmax(0, 1fr) 16px 260px');
  });

  it('resizes through the separators', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const [left, right] = Array.from(el.querySelectorAll<HTMLElement>('[role="separator"]'));
    left.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    right.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }),
    );
    await fixture.whenStable();
    const widths = TestBed.inject(PanelWidthService);
    expect([widths.left(), widths.right()]).toEqual([336, 256]);
    expect(left.getAttribute('aria-valuenow')).toBe('336');
  });

  it('tells the service how much room there is when its size changes', async () => {
    let callback: ResizeObserverCallback = () => undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          callback = cb;
        }
        observe(): void {}
        disconnect(): void {}
        unobserve(): void {}
      },
    );
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const widths = TestBed.inject(PanelWidthService);
    widths.setLeft(560);
    widths.setRight(560);
    // content 1036 -> 1004 shared by the three columns, 524 left for the panels
    callback([{ contentRect: { width: 1036 } } as ResizeObserverEntry], {} as ResizeObserver);
    await fixture.whenStable();
    expect(widths.left() + widths.right()).toBe(1004 - 480);
    const layout = (fixture.nativeElement as HTMLElement).querySelector(
      'app-workspace-layout',
    ) as HTMLElement;
    expect(layout.style.gridTemplateColumns).toBe('262px 16px minmax(0, 1fr) 16px 262px');
  });
});
