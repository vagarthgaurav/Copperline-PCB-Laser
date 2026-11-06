import { Component, computed, output, signal } from '@angular/core';

type Layer = 'lower' | 'upper' | 'symbols';

const LAYERS: Record<Layer, readonly string[]> = {
  lower: ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'],
  upper: ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'],
  symbols: ['!@#$%^&*()', '-_=+[]{};', `:'"\\,./?`, '<>|~`'],
};

/**
 * A small on-screen keyboard for the admin password: the Pi has no hardware
 * keyboard and an input field would pop up the system one over the kiosk.
 * Every key is a real button. It emits characters, `backspace` and `submit`.
 */
@Component({
  selector: 'kiosk-on-screen-keyboard',
  template: `
    <div class="keys" role="group" aria-label="On-screen keyboard">
      @for (row of rows(); track $index) {
        <div class="row">
          @if ($last && layer() !== 'symbols') {
            <button type="button" class="key wide" [attr.aria-pressed]="layer() === 'upper'" (click)="toggleShift()">Shift</button>
          }
          @for (key of row; track key) {
            <button type="button" class="key" (click)="char.emit(key)">{{ key }}</button>
          }
          @if ($last) {
            <button type="button" class="key wide" aria-label="Backspace" (click)="backspace.emit()">⌫</button>
          }
        </div>
      }
      <div class="row">
        <button type="button" class="key wide" (click)="toggleSymbols()">{{ layer() === 'symbols' ? 'abc' : '#+=' }}</button>
        <button type="button" class="key space" aria-label="Space" (click)="char.emit(' ')"></button>
        <button type="button" class="key wide go" (click)="submit.emit()">Unlock</button>
      </div>
    </div>
  `,
  styles: `
    .keys {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .row {
      display: flex;
      justify-content: center;
      gap: 6px;
    }

    .key {
      flex: 0 0 auto;
      width: 60px;
      height: 46px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      background: var(--surface-300);
      color: var(--ink);
      font: 600 18px/1 var(--font-sans);
      cursor: pointer;
    }

    .key:active {
      background: var(--surface-sunken);
    }

    .key.wide {
      width: 96px;
      font-size: 15px;
    }

    .key.space {
      flex: 1;
    }

    .key[aria-pressed='true'] {
      background: var(--accent-soft);
      border-color: var(--accent-strong);
    }

    .key.go {
      background: var(--accent);
      border-color: var(--accent);
      color: var(--on-accent);
    }
  `,
})
export class OnScreenKeyboard {
  readonly char = output<string>();
  readonly backspace = output<void>();
  readonly submit = output<void>();

  protected readonly layer = signal<Layer>('lower');
  protected readonly rows = computed(() => LAYERS[this.layer()]);

  protected toggleShift(): void {
    this.layer.update((layer) => (layer === 'upper' ? 'lower' : 'upper'));
  }

  protected toggleSymbols(): void {
    this.layer.update((layer) => (layer === 'symbols' ? 'lower' : 'symbols'));
  }
}
