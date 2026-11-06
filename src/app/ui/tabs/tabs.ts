import { Component, ElementRef, input, model, viewChildren } from '@angular/core';

export interface TabItem {
  readonly id: string;
  readonly label: string;
}

/**
 * A row of tabs (WAI-ARIA tablist). `selected` is two-way bound to the id of
 * the active tab. Each tab button has the id `{idPrefix}-tab-{id}` and
 * controls `{idPrefix}-panel-{id}`; the owner renders the panel with that id,
 * `role="tabpanel"` and `aria-labelledby` pointing back at the tab.
 */
@Component({
  selector: 'app-tabs',
  template: `
    <div class="list" role="tablist" [attr.aria-label]="label()">
      @for (tab of tabs(); track tab.id; let i = $index) {
        <button
          #tabButton
          type="button"
          role="tab"
          [id]="idPrefix() + '-tab-' + tab.id"
          [attr.aria-selected]="tab.id === selected()"
          [attr.aria-controls]="idPrefix() + '-panel-' + tab.id"
          [attr.tabindex]="tab.id === selected() ? 0 : -1"
          (click)="selected.set(tab.id)"
          (keydown)="onKey($event, i)"
        >
          {{ tab.label }}
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .list {
      display: flex;
      gap: var(--space-1);
      border-bottom: 1px solid var(--border);
    }

    button {
      position: relative;
      flex: 1;
      height: 36px;
      padding: 0 var(--space-3);
      border: 0;
      border-radius: var(--radius-md) var(--radius-md) 0 0;
      background: transparent;
      color: var(--ink-muted);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }

    button:hover {
      color: var(--ink);
      background: var(--surface-sunken);
    }

    button[aria-selected='true'] {
      color: var(--ink);
    }

    button[aria-selected='true']::after {
      content: '';
      position: absolute;
      left: var(--space-3);
      right: var(--space-3);
      bottom: -1px;
      height: 3px;
      border-radius: var(--radius-pill);
      background: var(--accent);
    }
  `,
})
export class Tabs {
  readonly tabs = input.required<readonly TabItem[]>();
  readonly label = input.required<string>();
  readonly idPrefix = input.required<string>();
  readonly selected = model.required<string>();

  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');

  /** Arrow keys, Home and End move focus and select, wrapping at the ends. */
  protected onKey(event: KeyboardEvent, index: number): void {
    const count = this.tabs().length;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % count;
        break;
      case 'ArrowLeft':
        next = (index - 1 + count) % count;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.selected.set(this.tabs()[next].id);
    this.buttons()[next]?.nativeElement.focus();
  }
}
