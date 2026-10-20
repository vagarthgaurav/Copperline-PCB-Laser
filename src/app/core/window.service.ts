import { DestroyRef, Service, inject, signal } from '@angular/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

type UnlistenFn = () => void;

/** True when running inside the Tauri webview (false for plain `ng serve`). */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Thin wrapper around the Tauri window for the custom title bar. It exposes
 * `maximized` and `focused` as signals (kept current from `onResized` and
 * `onFocusChanged`) and the three window actions. Outside Tauri, for example
 * under `ng serve` in a browser, the actions are no-ops and the signals keep
 * their defaults (`maximized = false`, `focused = true`).
 *
 * Dragging is not exposed here: the title bar uses `data-tauri-drag-region`.
 */
@Service()
export class WindowService {
  private readonly appWindow = isTauri() ? getCurrentWindow() : null;

  private readonly _maximized = signal(false);
  private readonly _focused = signal(true);

  readonly maximized = this._maximized.asReadonly();
  readonly focused = this._focused.asReadonly();

  constructor() {
    const appWindow = this.appWindow;
    if (!appWindow) {
      return;
    }

    let destroyed = false;
    const unlisteners: UnlistenFn[] = [];
    const track = (pending: Promise<UnlistenFn>) => {
      pending.then(
        (unlisten) => (destroyed ? unlisten() : unlisteners.push(unlisten)),
        () => undefined,
      );
    };

    const syncMaximized = () =>
      appWindow.isMaximized().then(
        (value) => {
          if (!destroyed) {
            this._maximized.set(value);
          }
        },
        () => undefined,
      );

    void syncMaximized();
    appWindow.isFocused().then(
      (value) => {
        if (!destroyed) {
          this._focused.set(value);
        }
      },
      () => undefined,
    );

    track(appWindow.onResized(() => void syncMaximized()));
    track(
      appWindow.onFocusChanged(({ payload }) => {
        if (!destroyed) {
          this._focused.set(payload);
        }
      }),
    );

    inject(DestroyRef).onDestroy(() => {
      destroyed = true;
      unlisteners.splice(0).forEach((unlisten) => unlisten());
    });
  }

  minimize(): void {
    void this.appWindow?.minimize();
  }

  toggleMaximize(): void {
    void this.appWindow?.toggleMaximize();
  }

  close(): void {
    void this.appWindow?.close();
  }
}
