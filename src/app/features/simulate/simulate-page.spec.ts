import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { SimulatePage } from './simulate-page';

describe('SimulatePage', () => {
  async function setup() {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'simulate', component: SimulatePage }])] });
    const harness = await RouterTestingHarness.create('/simulate');
    return harness.routeNativeElement as HTMLElement;
  }

  it('renders the panel headings with empty-state text', async () => {
    const el = await setup();
    const [left, right] = Array.from(el.querySelectorAll('app-panel'));
    const headings = (panel: Element) => Array.from(panel.querySelectorAll('h2')).map((h) => h.textContent);
    expect(headings(left)).toEqual(["Dry run","Layers","Job settings"]);
    expect(headings(right)).toEqual(["Current move","G-code"]);
    el.querySelectorAll('section').forEach((section) => {
      expect(section.querySelector('app-empty-note')?.textContent?.trim()).toBeTruthy();
    });
  });

  it('labels the panels and shows the viewport placeholder in main', async () => {
    const el = await setup();
    const labels = Array.from(el.querySelectorAll('app-panel')).map((p) => p.getAttribute('aria-label'));
    expect(labels).toEqual(['Simulation summary', 'G-code progress']);
    expect(el.querySelector('main')?.textContent).toContain('3D viewport');
  });

  it('shows no digits as placeholder data', async () => {
    const el = await setup();
    expect((el.textContent ?? '').replace('3D', '')).not.toMatch(/\d/);
  });
});
