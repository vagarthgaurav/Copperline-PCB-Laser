import { TestBed } from '@angular/core/testing';
import { THEME_STORAGE_KEY, ThemeService } from './theme.service';

function stubMatchMedia(dark: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = [];
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({
      matches: dark,
      addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.push(l),
      removeEventListener: () => undefined,
    })),
  );
  window.matchMedia = globalThis.matchMedia;
  return listeners;
}

function create(): ThemeService {
  return TestBed.inject(ThemeService);
}

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('defaults to the OS preference and does not persist it', () => {
    stubMatchMedia(true);
    const service = create();
    TestBed.tick();
    expect(service.theme()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('uses light when the OS prefers light', () => {
    stubMatchMedia(false);
    expect(create().theme()).toBe('light');
  });

  it('prefers a persisted choice over the OS', () => {
    stubMatchMedia(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(create().theme()).toBe('light');
  });

  it('ignores an invalid persisted value', () => {
    stubMatchMedia(false);
    localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(create().theme()).toBe('light');
  });

  it('toggle updates the signal, label, attribute and storage', () => {
    stubMatchMedia(false);
    const service = create();
    TestBed.tick();
    expect(service.toggleLabel()).toBe('Switch to dark theme');

    service.toggle();
    TestBed.tick();
    expect(service.theme()).toBe('dark');
    expect(service.toggleLabel()).toBe('Switch to light theme');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    service.toggle();
    expect(service.theme()).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('follows OS changes until an explicit choice is made', () => {
    const listeners = stubMatchMedia(false);
    const service = create();
    listeners.forEach((l) => l({ matches: true }));
    expect(service.theme()).toBe('dark');

    service.set('light');
    listeners.forEach((l) => l({ matches: true }));
    expect(service.theme()).toBe('light');
  });

  it('survives storage errors', () => {
    stubMatchMedia(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const service = create();
    expect(service.theme()).toBe('light');
    expect(() => service.toggle()).not.toThrow();
    expect(service.theme()).toBe('dark');
  });
});
