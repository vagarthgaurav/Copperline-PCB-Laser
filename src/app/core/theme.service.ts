import { DOCUMENT } from '@angular/common';
import { Service, computed, effect, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'copperline.theme';

/**
 * Owns the light/dark theme. The initial value is the persisted explicit
 * choice, else the OS preference. The value is mirrored to
 * `<html data-theme>`; it is persisted only after an explicit toggle/set.
 * Until then the service follows OS changes.
 */
@Service()
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly darkQuery = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');

  private readonly stored = this.readStored();
  private explicit = this.stored !== null;

  private readonly _theme = signal<Theme>(this.stored ?? (this.darkQuery?.matches ? 'dark' : 'light'));

  readonly theme = this._theme.asReadonly();

  readonly toggleLabel = computed(() =>
    this._theme() === 'light' ? 'Switch to dark theme' : 'Switch to light theme',
  );

  constructor() {
    effect(() => {
      this.document.documentElement.dataset['theme'] = this._theme();
    });

    this.darkQuery?.addEventListener?.('change', (event) => {
      if (!this.explicit) {
        this._theme.set(event.matches ? 'dark' : 'light');
      }
    });
  }

  toggle(): void {
    this.set(this._theme() === 'light' ? 'dark' : 'light');
  }

  set(theme: Theme): void {
    this.explicit = true;
    this._theme.set(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage unavailable; the choice still applies for this session.
    }
  }

  private readStored(): Theme | null {
    try {
      const value = localStorage.getItem(THEME_STORAGE_KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null;
    }
  }
}
