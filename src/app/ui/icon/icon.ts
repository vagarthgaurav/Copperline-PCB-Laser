import { Component, computed, input } from '@angular/core';
import { ICONS, IconName } from './icons';

export type IconWeight = 'regular' | 'fill';

/**
 * Inline Phosphor icon. Always decorative (`aria-hidden`): give the surrounding
 * control an accessible name through its text or an `aria-label`.
 * Use 20px by default and 16px inside chips, inputs and dense toolbars.
 * Use the `fill` weight only for selected or active states.
 */
@Component({
  selector: 'app-icon',
  template: `<svg
    [attr.width]="size()"
    [attr.height]="size()"
    viewBox="0 0 256 256"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
  >
    <path [attr.d]="path()" />
  </svg>`,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
    svg {
      display: block;
    }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(20);
  readonly weight = input<IconWeight>('regular');

  protected readonly path = computed(() => ICONS[this.name()][this.weight()]);
}
