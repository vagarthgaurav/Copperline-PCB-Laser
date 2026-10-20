import { Component, booleanAttribute, computed, input, output } from '@angular/core';
import { Button } from '../button/button';
import { Icon } from '../icon/icon';

export type BannerSeverity = 'warning' | 'error';

/**
 * Message strip for conditions that need more room than a chip. Project
 * action buttons as content; set `dismissible` for a close button.
 * Errors are announced assertively (`role="alert"`), warnings politely.
 */
@Component({
  selector: 'app-banner',
  imports: [Button, Icon],
  template: `
    <app-icon [name]="severity() === 'error' ? 'warning-circle' : 'warning'" />
    <p class="text">
      <span class="body-strong title">{{ title() }}</span>
      <span class="body msg">{{ message() }}</span>
    </p>
    <ng-content />
    @if (dismissible()) {
      <button
        appButton
        variant="ghost"
        size="sm"
        iconOnly
        [attr.aria-label]="'Dismiss ' + severity()"
        (click)="dismissed.emit()"
      >
        <app-icon name="x" />
      </button>
    }
  `,
  styleUrl: './banner.scss',
  host: {
    '[attr.role]': 'severity() === "error" ? "alert" : "status"',
    '[attr.data-severity]': 'severity()',
  },
})
export class Banner {
  readonly severity = input<BannerSeverity>('warning');
  readonly message = input.required<string>();
  readonly dismissible = input(false, { transform: booleanAttribute });
  readonly dismissed = output<void>();

  protected readonly title = computed(() => (this.severity() === 'error' ? 'Error' : 'Warning'));
}
