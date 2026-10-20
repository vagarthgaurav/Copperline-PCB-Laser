import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { invoke } from '@tauri-apps/api/core';
import { GerberService } from '../../core/gerber.service';
import { parsedProject } from '../../core/gerber.fixtures';
import { DesignPage } from './design-page';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('DesignPage', () => {
  async function setup() {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'design', component: DesignPage }])] });
    const harness = await RouterTestingHarness.create('/design');
    return harness.routeNativeElement as HTMLElement;
  }

  it('renders the panel headings with empty-state text', async () => {
    const el = await setup();
    const [left, right] = Array.from(el.querySelectorAll('app-panel'));
    const headings = (panel: Element) => Array.from(panel.querySelectorAll('h2')).map((h) => h.textContent);
    expect(headings(left)).toEqual(["Project","Layers","Placement","Engraving"]);
    expect(headings(right)).toEqual(["Placement","G-code"]);
    el.querySelectorAll('section').forEach((section) => {
      expect(section.querySelector('app-empty-note')?.textContent?.trim()).toBeTruthy();
    });
  });

  it('labels the panels and shows the viewport placeholder in main', async () => {
    const el = await setup();
    const labels = Array.from(el.querySelectorAll('app-panel')).map((p) => p.getAttribute('aria-label'));
    expect(labels).toEqual(['Project and placement settings', 'Placement readout and G-code']);
    expect(el.querySelector('main')?.textContent).toContain('3D viewport');
  });

  it('shows no digits as placeholder data', async () => {
    const el = await setup();
    expect((el.textContent ?? '').replace('3D', '')).not.toMatch(/\d/);
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
    } finally {
      delete (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'];
    }
  });
});
