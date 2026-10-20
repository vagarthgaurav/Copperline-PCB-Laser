import { Component, computed, inject } from '@angular/core';
import { WindowService } from '../core/window.service';
import { Icon } from '../ui/icon/icon';

/**
 * Minimize, maximize/restore and close buttons for the frameless window.
 * Sits at the right of the title bar on every platform (no traffic lights).
 * Never carries `data-tauri-drag-region`.
 */
@Component({
  selector: 'app-window-controls',
  imports: [Icon],
  template: `
    <button type="button" class="wbtn" aria-label="Minimize" (click)="win.minimize()">
      <app-icon name="minus" [size]="16" />
    </button>
    <button type="button" class="wbtn" [attr.aria-label]="toggleLabel()" (click)="win.toggleMaximize()">
      <app-icon [name]="win.maximized() ? 'copy' : 'square'" [size]="16" />
    </button>
    <button type="button" class="wbtn close" aria-label="Close" (click)="win.close()">
      <app-icon name="x" [size]="16" />
    </button>
  `,
  styles: `
    :host {
      display: flex;
      gap: 2px;
    }

    .wbtn {
      display: grid;
      place-items: center;
      width: 38px;
      height: 36px;
      padding: 0;
      border: 0;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--ink);
      cursor: pointer;
    }
    .wbtn:hover {
      background: var(--surface-sunken);
    }
    .wbtn:active {
      background: var(--border);
    }
    .wbtn.close:hover {
      background: var(--danger-soft);
      color: var(--danger);
    }
    .wbtn.close:active {
      background: var(--danger);
      color: var(--surface-300);
    }

    :host(.inactive) .wbtn {
      color: var(--ink-muted);
    }
  `,
  host: {
    role: 'group',
    'aria-label': 'Window controls',
    '[class.inactive]': '!win.focused()',
  },
})
export class WindowControls {
  protected readonly win = inject(WindowService);

  protected readonly toggleLabel = computed(() => (this.win.maximized() ? 'Restore' : 'Maximize'));
}
