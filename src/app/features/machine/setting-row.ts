import { Component, computed, input, output } from '@angular/core';
import { SettingDef, isValidSettingValue } from '../../core/grbl-settings';
import { Button } from '../../ui/button/button';
import { Field, FieldOption, FieldValue } from '../../ui/field/field';

let nextId = 0;

/**
 * One grblHAL setting: its control and a plain-language explanation. The
 * edited value is owned by the parent (`value`, null while the input is not a
 * number); the row reports edits through `valueChange` and never sends
 * anything to the machine.
 */
@Component({
  selector: 'app-setting-row',
  imports: [Field, Button],
  template: `
    @switch (def().kind) {
      @case ('mask') {
        <fieldset [attr.aria-describedby]="descId">
          <legend class="label">{{ title() }}</legend>
          @for (bit of bits(); track bit.bit) {
            <app-field
              kind="checkbox"
              [label]="bit.label"
              [disabled]="disabled()"
              [value]="bit.on"
              (valueChange)="onBit(bit.bit, $event)"
            />
          }
        </fieldset>
      }
      @case ('switch') {
        <app-field
          kind="switch"
          [label]="title()"
          [disabled]="disabled()"
          [value]="value() === 1"
          (valueChange)="valueChange.emit($event === true ? 1 : 0)"
        />
      }
      @case ('select') {
        <app-field
          kind="select"
          [label]="title()"
          [options]="options()"
          [disabled]="disabled()"
          [value]="value()"
          (valueChange)="onNumber($event)"
        />
      }
      @default {
        <app-field
          kind="number"
          [label]="title()"
          [unit]="def().unit"
          [min]="def().min"
          [step]="def().step"
          [disabled]="disabled()"
          [value]="value()"
          [error]="error()"
          (valueChange)="onNumber($event)"
        />
      }
    }
    <p class="desc small" [id]="descId">{{ def().description }}</p>
    @if (changed()) {
      <div class="actions">
        <span class="small edited">Changed from {{ current() }}</span>
        <button appButton size="sm" variant="ghost" [disabled]="disabled()" (click)="revert.emit()">Revert</button>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    fieldset {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-width: 0;
      margin: 0;
      padding: 0;
      border: 0;
    }

    .desc {
      margin: 0;
      color: var(--ink-muted);
    }

    .actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }

    .edited {
      color: var(--accent-strong);
    }
  `,
})
export class SettingRow {
  readonly def = input.required<SettingDef>();
  /** The value the machine reported, as text. */
  readonly current = input.required<string>();
  /** The edited value; null while the number field holds something that is not a number. */
  readonly value = input.required<number | null>();
  readonly changed = input(false);
  readonly disabled = input(false);
  readonly valueChange = output<number | null>();
  readonly revert = output<void>();

  protected readonly descId = `setting-desc-${nextId++}`;

  protected readonly title = computed(() => `$${this.def().id} · ${this.def().name}`);
  protected readonly error = computed(() =>
    isValidSettingValue(this.def(), this.value()) ? undefined : 'Enter a number in range.',
  );

  protected readonly options = computed<FieldOption[]>(() =>
    (this.def().choices ?? []).map((choice) => ({ value: choice.value, label: choice.label })),
  );

  protected readonly bits = computed(() => {
    const value = this.value() ?? 0;
    return Object.entries(this.def().bits ?? {}).map(([bit, label]) => ({
      bit: Number(bit),
      label,
      on: (value & (1 << Number(bit))) !== 0,
    }));
  });

  protected onNumber(value: FieldValue): void {
    this.valueChange.emit(typeof value === 'number' ? value : null);
  }

  protected onBit(bit: number, value: FieldValue): void {
    const base = this.value() ?? 0;
    this.valueChange.emit(value === true ? base | (1 << bit) : base & ~(1 << bit));
  }
}
