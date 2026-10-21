import { TestBed } from '@angular/core/testing';
import { NO_WEBGL } from '../../ui/peg-board-viewport/scene-factory.testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { invoke } from '@tauri-apps/api/core';
import { GerberService } from '../../core/gerber.service';
import { parsedProject } from '../../core/gerber.fixtures';
import { DesignPage } from './design-page';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('DesignPage', () => {
  async function setup() {
    TestBed.configureTestingModule({ providers: [NO_WEBGL, provideRouter([{ path: 'design', component: DesignPage }])] });
    const harness = await RouterTestingHarness.create('/design');
    return harness.routeNativeElement as HTMLElement;
  }

  it('renders the panel headings with empty-state text', async () => {
    const el = await setup();
    const [left, right] = Array.from(el.querySelectorAll('app-panel'));
    const headings = (panel: Element) => Array.from(panel.querySelectorAll('h2')).map((h) => h.textContent);
    expect(headings(left)).toEqual(["Project","Layers","Placement","Engraving"]);
    expect(headings(right)).toEqual(["Placement","G-code"]);
    el.querySelectorAll('app-panel-section section').forEach((section) => {
      expect(section.querySelector('app-empty-note')?.textContent?.trim()).toBeTruthy();
    });
  });

  it('shows the empty G-code viewer filling the right panel', async () => {
    const el = await setup();
    const viewer = el.querySelector('app-panel:last-of-type app-gcode-viewer')!;
    expect(viewer.textContent).toContain('No G-code yet. Press Generate G-code.');
    expect(viewer.querySelector('ol')).toBeNull();
  });

  it('labels the panels and puts the interactive viewport in main', async () => {
    const el = await setup();
    const labels = Array.from(el.querySelectorAll('app-panel')).map((p) => p.getAttribute('aria-label'));
    expect(labels).toEqual(['Project and placement settings', 'Placement readout and G-code']);
    const viewport = el.querySelector('main app-board-viewport');
    expect(viewport).not.toBeNull();
    expect(viewport?.querySelector('[aria-label="Board tools"]')).not.toBeNull();
    expect(viewport?.textContent).toContain('Open a Gerber to place a board');
  });

  it('shows no digits as placeholder data', async () => {
    const el = await setup();
    const text = Array.from(el.querySelectorAll('app-panel-section')).map((e) => e.textContent).join(' ');
    expect(text).not.toMatch(/\d/);
  });

  it('puts the project section and the layer list in the Project and Layers sections', async () => {
    const el = await setup();
    const [project, layers] = Array.from(el.querySelectorAll('app-panel section'));
    expect(project.querySelector('app-project-section button')?.textContent).toContain('Open Gerber…');
    expect(layers.querySelector('app-layer-list')).toBeTruthy();
  });

  it('shows the loaded project and its layers', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    try {
      vi.mocked(invoke).mockResolvedValue(parsedProject());
      const el = await setup();
      await TestBed.inject(GerberService).load([new File(['x'], 'a.gbr')]);
      await vi.waitFor(() => expect(el.querySelector('.filecard')).toBeTruthy());
      expect(el.querySelector('.filecard')?.textContent).toContain('4 layers · 80 × 55 mm');
      expect(el.querySelectorAll('button.layer').length).toBe(4);
      expect(el.querySelectorAll('app-placement-section app-field').length).toBe(4);
      expect(el.querySelectorAll('app-engraving-section app-field').length).toBe(5);
      expect(el.querySelectorAll('app-placement-readout app-tile').length).toBe(2);
    } finally {
      delete (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'];
    }
  });

  describe('G-code panel while generating', () => {
    beforeEach(() => {
      Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    });
    afterEach(() => {
      delete (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'];
    });

    const viewer = (el: HTMLElement) => el.querySelector('app-panel:last-of-type app-gcode-viewer')!;

    it('shows the generating message while the request is in flight', async () => {
      vi.mocked(invoke).mockImplementation((command) =>
        command === 'generate_gcode' ? new Promise(() => {}) : Promise.resolve(parsedProject()),
      );
      const el = await setup();
      await TestBed.inject(GerberService).load([new File(['x'], 'a.gbr')]);
      await vi.waitFor(() => expect(el.querySelector('app-engraving-section button')).toBeTruthy());
      el.querySelector<HTMLButtonElement>('app-engraving-section button')!.click();
      await vi.waitFor(() => expect(viewer(el).textContent).toContain('Generating G-code…'));
    });

    it('shows the error text when generation fails', async () => {
      vi.mocked(invoke).mockImplementation((command) =>
        command === 'generate_gcode'
          ? Promise.reject('Nothing to engrave')
          : Promise.resolve(parsedProject()),
      );
      const el = await setup();
      await TestBed.inject(GerberService).load([new File(['x'], 'a.gbr')]);
      await vi.waitFor(() => expect(el.querySelector('app-engraving-section button')).toBeTruthy());
      el.querySelector<HTMLButtonElement>('app-engraving-section button')!.click();
      await vi.waitFor(() => expect(viewer(el).textContent).toContain('Nothing to engrave'));
    });
  });
});
