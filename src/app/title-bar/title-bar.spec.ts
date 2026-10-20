import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ThemeService } from '../core/theme.service';
import { WindowService } from '../core/window.service';
import { TitleBar, WorkspaceTab } from './title-bar';

describe('TitleBar', () => {
  const maximized = signal(false);
  const focused = signal(true);
  const windowService = {
    maximized,
    focused,
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  };

  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
    maximized.set(false);
    focused.set(true);
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [{ provide: WindowService, useValue: windowService }],
    });
  });

  async function setup() {
    const fixture = TestBed.createComponent(TitleBar);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const theme = TestBed.inject(ThemeService);
    theme.set('light');
    await fixture.whenStable();
    const tabs = () => Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const wbtn = (label: string) => el.querySelector<HTMLButtonElement>(`app-window-controls [aria-label="${label}"]`)!;
    const themeButton = () => el.querySelector<HTMLButtonElement>('button[aria-label^="Switch to"]')!;
    const exportButton = () =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.includes('Export G-code'))!;
    return { fixture, el, theme, tabs, wbtn, themeButton, exportButton };
  }

  it('renders a tablist with one selected tab and a roving tabindex', async () => {
    const { el, tabs } = await setup();
    expect(el.querySelector('[role="tablist"]')).toBeTruthy();
    expect(tabs().map((t) => t.textContent!.trim())).toEqual(['Design', 'Simulate', 'Machine']);
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1]);
  });

  it('selects a tab on click through the tab model', async () => {
    const { fixture, tabs } = await setup();
    tabs()[2].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.tab()).toBe('machine');
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true']);
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, -1, 0]);
  });

  it('emits tab changes', async () => {
    const { fixture, tabs } = await setup();
    const seen: WorkspaceTab[] = [];
    fixture.componentInstance.tab.subscribe((value) => seen.push(value));
    tabs()[1].click();
    expect(seen).toEqual(['simulate']);
  });

  it('moves between tabs with arrow keys, wrapping, and with Home and End', async () => {
    const { fixture, tabs } = await setup();
    const press = async (key: string) => {
      const active = tabs().find((t) => t.tabIndex === 0)!;
      active.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      await fixture.whenStable();
    };

    await press('ArrowRight');
    expect(fixture.componentInstance.tab()).toBe('simulate');
    expect(document.activeElement).toBe(tabs()[1]);

    await press('ArrowLeft');
    await press('ArrowLeft');
    expect(fixture.componentInstance.tab()).toBe('machine');

    await press('ArrowRight');
    expect(fixture.componentInstance.tab()).toBe('design');

    await press('End');
    expect(fixture.componentInstance.tab()).toBe('machine');
    await press('Home');
    expect(fixture.componentInstance.tab()).toBe('design');

    await press('a');
    expect(fixture.componentInstance.tab()).toBe('design');
  });

  it('shows the file chip only with a file name, as a drag region', async () => {
    const { fixture, el } = await setup();
    expect(el.querySelector('.filechip')).toBeNull();

    fixture.componentRef.setInput('fileName', 'board_v3.zip');
    fixture.componentRef.setInput('fileDetail', 'Top side');
    await fixture.whenStable();
    const chip = el.querySelector('.filechip')!;
    expect(chip.textContent).toContain('board_v3.zip');
    expect(chip.textContent).toContain('Top side');
    expect(chip.hasAttribute('data-tauri-drag-region')).toBe(true);
  });

  it('puts data-tauri-drag-region only on the spacer and file chip', async () => {
    const { fixture, el } = await setup();
    fixture.componentRef.setInput('fileName', 'a.zip');
    await fixture.whenStable();
    const regions = Array.from(el.querySelectorAll('[data-tauri-drag-region]'));
    expect(regions.map((r) => r.className.split(' ')[0])).toEqual(['spacer', 'filechip']);
    expect(el.querySelectorAll('button[data-tauri-drag-region], [role="tab"][data-tauri-drag-region]').length).toBe(0);
  });

  it('shows the machine status, with an optional label', async () => {
    const { fixture, el } = await setup();
    const chip = el.querySelector('app-status-chip')!;
    expect(chip.getAttribute('role')).toBe('status');
    expect(chip.textContent).toContain('Disconnected');

    fixture.componentRef.setInput('status', 'engraving');
    fixture.componentRef.setInput('statusLabel', 'Simulating');
    await fixture.whenStable();
    expect(chip.textContent).toContain('Simulating');
    expect(chip.getAttribute('data-status')).toBe('engraving');
  });

  it('toggles the theme from a labelled button and swaps the icon', async () => {
    const { fixture, theme, themeButton } = await setup();
    const before = themeButton().querySelector('path')!.getAttribute('d');
    expect(themeButton().getAttribute('aria-label')).toBe('Switch to dark theme');

    themeButton().click();
    await fixture.whenStable();
    expect(theme.theme()).toBe('dark');
    expect(themeButton().getAttribute('aria-label')).toBe('Switch to light theme');
    expect(themeButton().querySelector('path')!.getAttribute('d')).not.toBe(before);
  });

  it('emits exportRequested from the primary button and honours exportDisabled', async () => {
    const { fixture, exportButton } = await setup();
    const requested = vi.fn();
    fixture.componentInstance.exportRequested.subscribe(requested);

    expect(exportButton().dataset['variant']).toBe('primary');
    exportButton().click();
    expect(requested).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('exportDisabled', true);
    await fixture.whenStable();
    expect(exportButton().disabled).toBe(true);
    exportButton().click();
    expect(requested).toHaveBeenCalledTimes(1);
  });

  it('calls the window service from the window buttons', async () => {
    const { wbtn } = await setup();
    wbtn('Minimize').click();
    wbtn('Maximize').click();
    wbtn('Close').click();
    expect(windowService.minimize).toHaveBeenCalledTimes(1);
    expect(windowService.toggleMaximize).toHaveBeenCalledTimes(1);
    expect(windowService.close).toHaveBeenCalledTimes(1);
  });

  it('swaps the maximize icon for restore and squares the corners when maximized', async () => {
    const { fixture, el, wbtn } = await setup();
    const squarePath = wbtn('Maximize').querySelector('path')!.getAttribute('d');
    expect(el.classList).not.toContain('maximized');

    maximized.set(true);
    await fixture.whenStable();
    expect(el.classList).toContain('maximized');
    expect(wbtn('Maximize')).toBeNull();
    expect(wbtn('Restore').querySelector('path')!.getAttribute('d')).not.toBe(squarePath);
  });

  it('dims the bar when the window loses focus', async () => {
    const { fixture, el } = await setup();
    expect(el.classList).not.toContain('inactive');
    expect(el.querySelector('app-window-controls')!.classList).not.toContain('inactive');

    focused.set(false);
    await fixture.whenStable();
    expect(el.classList).toContain('inactive');
    expect(el.querySelector('app-window-controls')!.classList).toContain('inactive');
  });

  it('groups the window buttons with an accessible name', async () => {
    const { el } = await setup();
    const group = el.querySelector('app-window-controls')!;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Window controls');
  });
});
