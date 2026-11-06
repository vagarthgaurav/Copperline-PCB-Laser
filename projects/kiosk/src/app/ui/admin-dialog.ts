import { Component, ElementRef, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { Button } from '@app/ui/button/button';
import { AdminService } from '../core/admin.service';
import { OnScreenKeyboard } from './on-screen-keyboard';

/** Asks for the admin password with an on-screen keyboard (a physical keyboard works too). */
@Component({
  selector: 'kiosk-admin-dialog',
  imports: [Button, OnScreenKeyboard],
  template: `
    <dialog #dialog aria-labelledby="kiosk-admin-title" (cancel)="onCancel($event)" (keydown)="onKeydown($event)">
      <div class="head">
        <h2 id="kiosk-admin-title">Admin password</h2>
        <button appButton variant="ghost" (click)="cancelled.emit()">Cancel</button>
      </div>
      <output class="field" aria-live="polite" [attr.aria-label]="'Password, ' + password().length + ' characters entered'">
        {{ masked() }}
      </output>
      <p class="error" role="alert">{{ error() }}</p>
      <kiosk-on-screen-keyboard (char)="add($event)" (backspace)="remove()" (submit)="submit()" />
    </dialog>
  `,
  styles: `
    dialog {
      box-sizing: border-box;
      width: min(760px, calc(100vw - 16px));
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface-200);
      color: var(--ink);
      box-shadow: var(--shadow-md);
    }

    dialog[open] {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    dialog::backdrop {
      background: rgba(0, 0, 0, 0.55);
    }

    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    h2 {
      margin: 0;
      font: 600 20px/28px var(--font-display);
    }

    .field {
      display: flex;
      align-items: center;
      min-height: 48px;
      padding: 0 var(--space-3);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-md);
      background: var(--surface-300);
      font: 500 24px/1 var(--font-mono);
      letter-spacing: 0.15em;
    }

    .error {
      min-height: 20px;
      margin: 0;
      color: var(--danger);
      font-size: 14px;
      line-height: 20px;
    }
  `,
})
export class AdminDialog {
  private readonly admin = inject(AdminService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly open = input.required<boolean>();
  readonly unlocked = output<void>();
  readonly cancelled = output<void>();

  protected readonly password = signal('');
  protected readonly error = signal('');
  private checking = false;

  protected masked(): string {
    return '•'.repeat(this.password().length) || '\u00a0';
  }

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.open() && !el.open) {
        this.password.set('');
        this.error.set('');
        el.showModal();
      } else if (!this.open() && el.open) {
        el.close();
      }
    });
  }

  protected add(char: string): void {
    this.error.set('');
    this.password.update((value) => (value.length < 64 ? value + char : value));
  }

  protected remove(): void {
    this.password.update((value) => value.slice(0, -1));
  }

  protected async submit(): Promise<void> {
    if (this.checking || this.password() === '') {
      return;
    }
    this.checking = true;
    try {
      if (await this.admin.unlock(this.password())) {
        this.password.set('');
        this.unlocked.emit();
      } else {
        this.password.set('');
        this.error.set('Wrong password.');
      }
    } finally {
      this.checking = false;
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.target instanceof HTMLButtonElement && (event.key === 'Enter' || event.key === ' ')) {
      return; // Let a focused key press itself.
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      void this.submit();
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      this.remove();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      this.add(event.key);
    }
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.cancelled.emit();
  }
}
