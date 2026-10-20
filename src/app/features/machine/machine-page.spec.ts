import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { MachinePage } from './machine-page';

describe('MachinePage', () => {
  async function setup() {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'machine', component: MachinePage }])] });
    const harness = await RouterTestingHarness.create('/machine');
    return harness.routeNativeElement as HTMLElement;
  }

  it('renders the panel headings with empty-state text', async () => {
    const el = await setup();
    const [left, right] = Array.from(el.querySelectorAll('app-panel'));
    const headings = (panel: Element) => Array.from(panel.querySelectorAll('h2')).map((h) => h.textContent);
    expect(headings(left)).toEqual(["Connection","Position","Job","Console"]);
    expect(headings(right)).toEqual(["Current move","G-code"]);
    el.querySelectorAll('section').forEach((section) => {
      expect(section.querySelector('app-empty-note')?.textContent?.trim()).toBeTruthy();
    });
  });

  it('labels the panels and shows the viewport placeholder in main', async () => {
    const el = await setup();
    const labels = Array.from(el.querySelectorAll('app-panel')).map((p) => p.getAttribute('aria-label'));
    expect(labels).toEqual(['Machine status', 'Live G-code']);
    expect(el.querySelector('main')?.textContent).toContain('3D viewport');
  });

  it('shows no digits as placeholder data', async () => {
    const el = await setup();
    expect((el.textContent ?? '').replace('3D', '')).not.toMatch(/\d/);
  });
});
