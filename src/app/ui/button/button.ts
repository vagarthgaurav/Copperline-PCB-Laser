import { Component, booleanAttribute, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';

/**
 * Applied to a native button so keyboard, `disabled`, `type` and `click`
 * behave natively:
 *
 * ```html
 * <button appButton variant="primary" (click)="export()">
 *   <app-icon name="download-simple" /> Export G-code
 * </button>
 * ```
 *
 * Icon-only buttons set `iconOnly` (square) and must carry an `aria-label`.
 */
@Component({
  selector: 'button[appButton]',
  template: `<ng-content />`,
  styleUrl: './button.scss',
  host: {
    type: 'button',
    '[attr.data-variant]': 'variant()',
    '[attr.data-size]': 'size()',
    '[class.icon-only]': 'iconOnly()',
    '[disabled]': 'disabled()',
  },
})
export class Button {
  readonly variant = input<ButtonVariant>('secondary');
  readonly size = input<ButtonSize>('md');
  readonly iconOnly = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
}
