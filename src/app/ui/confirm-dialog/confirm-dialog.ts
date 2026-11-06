import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';
import { Button } from '../button/button';

let nextId = 0;

/**
 * Modal confirmation built on the native `<dialog>`: focus moves into it,
 * Tab stays inside, Escape cancels and the page behind is inert. Project the
 * body as content. `open` is controlled by the parent, which closes the
 * dialog in its `cancelled` and `confirmed` handlers.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [Button],
  template: `
    <dialog #dialog [attr.aria-labelledby]="headingId" (cancel)="onCancel($event)">
      <h2 class="title" [id]="headingId">{{ heading() }}</h2>
      <div class="body"><ng-content /></div>
      <div class="actions">
        <button appButton [disabled]="busy()" (click)="cancelled.emit()">Cancel</button>
        <button appButton variant="primary" [disabled]="busy() || confirmDisabled()" (click)="confirmed.emit()">
          {{ busy() ? 'Working…' : confirmLabel() }}
        </button>
      </div>
    </dialog>
  `,
  styles: `
    dialog {
      box-sizing: border-box;
      width: min(520px, calc(100vw - 2 * var(--space-4)));
      max-height: calc(100vh - 2 * var(--space-6));
      padding: var(--space-5);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface-300);
      color: var(--ink);
      box-shadow: var(--shadow-md);
    }

    dialog[open] {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    dialog::backdrop {
      background: rgba(0, 0, 0, 0.5);
    }

    .title {
      margin: 0;
    }

    .body {
      min-height: 0;
      overflow-y: auto;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
    }
  `,
})
export class ConfirmDialog {
  readonly open = input.required<boolean>();
  readonly heading = input.required<string>();
  readonly confirmLabel = input('Confirm');
  /** True while the confirmed action runs; the buttons are disabled. */
  readonly busy = input(false);
  readonly confirmDisabled = input(false);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected readonly headingId = `confirm-dialog-${nextId++}`;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.open() && !el.open) {
        if (typeof el.showModal === 'function') {
          el.showModal();
        } else {
          el.setAttribute('open', '');
        }
      } else if (!this.open() && el.open) {
        if (typeof el.close === 'function') {
          el.close();
        } else {
          el.removeAttribute('open');
        }
      }
    });
  }

  /** Escape: let the parent decide, unless the action is running. */
  protected onCancel(event: Event): void {
    event.preventDefault();
    if (!this.busy()) {
      this.cancelled.emit();
    }
  }
}
