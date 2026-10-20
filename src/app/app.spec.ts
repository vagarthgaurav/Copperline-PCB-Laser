import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { WindowService } from './core/window.service';

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        {
          provide: WindowService,
          useValue: {
            maximized: signal(false),
            focused: signal(true),
            minimize: vi.fn(),
            toggleMaximize: vi.fn(),
            close: vi.fn(),
          },
        },
      ],
    });
  });

  async function setup(url = '/') {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement, router };
  }

  const selectedTab = (el: HTMLElement) =>
    el.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim();

  it('renders the title bar in a banner header and a router outlet', async () => {
    const { el } = await setup();
    expect(el.querySelector('header > app-title-bar')).not.toBeNull();
    expect(el.querySelector('router-outlet')).not.toBeNull();
  });

  it('redirects the empty path to /design and renders that workspace', async () => {
    const { el, router } = await setup('/');
    expect(router.url).toBe('/design');
    expect(selectedTab(el)).toBe('Design');
    expect(el.querySelector('app-design-page')).not.toBeNull();
  });

  it('marks the tab that matches the URL', async () => {
    const { el, router, fixture } = await setup('/design');
    await router.navigateByUrl('/machine');
    await fixture.whenStable();
    expect(selectedTab(el)).toBe('Machine');
    await router.navigateByUrl('/simulate');
    await fixture.whenStable();
    expect(selectedTab(el)).toBe('Simulate');
  });

  it('navigates when a tab is clicked', async () => {
    const { el, router, fixture } = await setup('/design');
    const tab = Array.from(el.querySelectorAll<HTMLElement>('[role="tab"]')).find(
      (t) => t.textContent?.trim() === 'Simulate',
    )!;
    tab.click();
    await fixture.whenStable();
    expect(router.url).toBe('/simulate');
    expect(selectedTab(el)).toBe('Simulate');
    expect(el.querySelector('app-simulate-page')).not.toBeNull();
  });

  it('keeps Export G-code disabled until a project is loaded', async () => {
    const { el } = await setup();
    const exportButton = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Export G-code'),
    );
    expect(exportButton?.disabled).toBe(true);
  });
});
