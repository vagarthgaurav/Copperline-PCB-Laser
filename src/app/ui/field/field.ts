import {
  Component,
  ElementRef,
  booleanAttribute,
  computed,
  input,
  linkedSignal,
  model,
  numberAttribute,
  viewChildren,
} from '@angular/core';
import { Icon } from '../icon/icon';

export type FieldKind = 'text' | 'number' | 'select' | 'switch' | 'segmented' | 'checkbox' | 'slider';

/** Strings for text, select and segmented; numbers for number and slider; booleans for switch and checkbox. */
export type FieldValue = string | number | boolean | null;

export interface FieldOption {
  readonly value: string | number;
  readonly label: string;
}

let nextId = 0;

function optionalNumber(value: number | string | undefined): number | undefined {
  return value === undefined ? undefined : numberAttribute(value);
}

function parseNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed === '') {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A labelled form control with optional help and error text. `kind` picks the
 * control; `value` is two-way bound. A numeric field reports `null` while its
 * text is empty or not a number, so the parent can show an `error`.
 *
 * For switch and checkbox the label is the text beside the control; for every
 * other kind it is the uppercase caption above it.
 */
@Component({
  selector: 'app-field',
  imports: [Icon],
  templateUrl: './field.html',
  styleUrl: './field.scss',
})
export class Field {
  readonly kind = input<FieldKind>('text');
  readonly label = input.required<string>();
  readonly value = model<FieldValue>(null);
  readonly unit = input<string>();
  readonly min = input(undefined, { transform: optionalNumber });
  readonly max = input(undefined, { transform: optionalNumber });
  readonly step = input(undefined, { transform: optionalNumber });
  readonly options = input<readonly FieldOption[]>([]);
  readonly placeholder = input('');
  readonly help = input<string>();
  readonly error = input<string>();
  readonly disabled = input(false, { transform: booleanAttribute });

  private readonly uid = `app-field-${nextId++}`;
  protected readonly controlId = `${this.uid}-control`;
  protected readonly labelId = `${this.uid}-label`;
  protected readonly helpId = `${this.uid}-help`;
  protected readonly errorId = `${this.uid}-error`;

  protected readonly describedBy = computed(() => {
    const ids = [this.help() ? this.helpId : null, this.error() ? this.errorId : null].filter(
      (id) => id !== null,
    );
    return ids.length > 0 ? ids.join(' ') : null;
  });

  protected readonly textValue = computed(() => {
    const v = this.value();
    return v === null ? '' : String(v);
  });

  /** What the user typed in a numeric field; survives partial input such as "12.". */
  protected readonly numberText = linkedSignal<FieldValue, string>({
    source: this.value,
    computation: (value, previous) =>
      previous !== undefined && parseNumber(previous.value) === value
        ? previous.value
        : value === null
          ? ''
          : String(value),
  });

  protected readonly checked = computed(() => this.value() === true);

  protected readonly sliderMin = computed(() => this.min() ?? 0);
  protected readonly sliderMax = computed(() => this.max() ?? 100);
  protected readonly sliderValue = computed(() => {
    const v = this.value();
    return typeof v === 'number' ? v : this.sliderMin();
  });
  protected readonly sliderPercent = computed(() => {
    const span = this.sliderMax() - this.sliderMin();
    if (span <= 0) {
      return 0;
    }
    const ratio = (this.sliderValue() - this.sliderMin()) / span;
    return Math.min(100, Math.max(0, ratio * 100));
  });

  protected readonly selectedIndex = computed(() =>
    this.options().findIndex((option) => option.value === this.value()),
  );

  private readonly radios = viewChildren<ElementRef<HTMLButtonElement>>('radio');

  protected formatWithUnit(value: number): string {
    const unit = this.unit();
    if (!unit) {
      return String(value);
    }
    return unit === '%' ? `${value}%` : `${value} ${unit}`;
  }

  protected onText(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }

  protected onNumber(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.numberText.set(raw);
    this.value.set(parseNumber(raw));
  }

  /** ArrowUp and ArrowDown step a numeric field by `step` (default 1), within `min` and `max`. */
  protected onNumberKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }
    event.preventDefault();
    const step = this.step() ?? 1;
    const decimals = String(step).split('.')[1]?.length ?? 0;
    const current = parseNumber(this.numberText()) ?? 0;
    const direction = event.key === 'ArrowUp' ? 1 : -1;
    const min = this.min() ?? -Infinity;
    const max = this.max() ?? Infinity;
    const next = Math.min(max, Math.max(min, Number((current + direction * step).toFixed(decimals))));
    this.numberText.set(next.toFixed(decimals));
    this.value.set(next);
  }

  protected onSelect(event: Event): void {
    const raw = (event.target as HTMLSelectElement).value;
    const option = this.options().find((o) => String(o.value) === raw);
    if (option) {
      this.value.set(option.value);
    }
  }

  protected toggle(): void {
    this.value.set(!this.checked());
  }

  protected onCheckbox(event: Event): void {
    this.value.set((event.target as HTMLInputElement).checked);
  }

  protected onSlider(event: Event): void {
    this.value.set(Number((event.target as HTMLInputElement).value));
  }

  protected select(index: number): void {
    const option = this.options()[index];
    if (option && !this.disabled()) {
      this.value.set(option.value);
    }
  }

  /** Radio group keyboard: arrows move and select, wrapping at the ends. */
  protected onSegmentKey(event: KeyboardEvent, index: number): void {
    const count = this.options().length;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (index + 1) % count;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (index - 1 + count) % count;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.select(next);
    this.radios()[next]?.nativeElement.focus();
  }
}
