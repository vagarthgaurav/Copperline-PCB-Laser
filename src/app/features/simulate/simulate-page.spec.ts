import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { GcodeService } from '../../core/gcode.service';
import { SimulationService } from '../../core/simulation.service';
import { SimulatePage } from './simulate-page';

describe('SimulatePage', () => {
  async function setup(lines: readonly string[] = []) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'simulate', component: SimulatePage },
          { path: 'design', children: [] },
          { path: 'machine', children: [] },
        ]),
      ],
    });
    TestBed.inject(GcodeService).setLines(lines);
    const harness = await RouterTestingHarness.create('/simulate');
    return { harness, el: harness.routeNativeElement as HTMLElement };
  }

  const headings = (panel: Element) => Array.from(panel.querySelectorAll('h2')).map((h) => h.textContent?.trim());

  afterEach(() => TestBed.inject(SimulationService).pause());

  it('renders the panel headings', async () => {
    const { el } = await setup();
    const [left, right] = Array.from(el.querySelectorAll('app-panel'));
    expect(headings(left)).toEqual(['Dry run', 'Layers', 'Job settings']);
    expect(headings(right)).toEqual(['Current move', 'G-code']);
  });

  it('labels the panels and puts the viewport placeholder and controls in main', async () => {
    const { el } = await setup();
    const labels = Array.from(el.querySelectorAll('app-panel')).map((p) => p.getAttribute('aria-label'));
    expect(labels).toEqual(['Simulation summary', 'G-code progress']);
    const main = el.querySelector('main')!;
    expect(main.textContent).toContain('3D viewport');
    expect(Array.from(main.children).map((child) => child.tagName.toLowerCase())).toEqual([
      'app-viewport-placeholder',
      'app-simulation-controls',
    ]);
  });

  it('shows the empty states without G-code', async () => {
    const { el } = await setup();
    const text = el.textContent ?? '';
    expect(text).toContain('Nothing to simulate yet. Load a Gerber in Design first.');
    expect(text).toContain('No G-code yet. Load a Gerber in Design to generate it.');
    expect(text).toContain('Layer progress appears while a simulation runs.');
    expect(text).toContain('Simulating — nothing is sent to the machine');
    expect(el.querySelector('app-current-move')?.textContent?.match(/—/g)?.length).toBe(2);
  });

  it('shows the populated state and starts paused', async () => {
    const { harness, el } = await setup(['G0 X10 Y20', 'G1 X50 Y20 F1200', 'M5']);
    harness.detectChanges();
    expect(TestBed.inject(SimulationService).playing()).toBe(false);
    expect(el.querySelector('app-dry-run-section')?.textContent).toContain('Total time');
    expect(el.querySelector('app-gcode-viewer')?.textContent).toContain('3 lines');
    expect(el.querySelector('app-gcode-viewer ol')).not.toBeNull();
    expect(el.querySelector('app-empty-note')?.textContent).not.toContain('Nothing to simulate');
  });

  it('navigates to Design and Machine from the panel buttons', async () => {
    const { harness, el } = await setup();
    const router = TestBed.inject(Router);
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>('.nav button'));
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Adjust placement', 'Continue to machine']);
    buttons[1].click();
    await harness.fixture.whenStable();
    expect(router.url).toBe('/machine');
  });
});
