import { Component, input } from '@angular/core';

/**
 * Side panel surface: `surface-200`, 1px border, `radius-lg`, no shadow.
 * Fill it with `app-panel-section` children. `label` names the landmark.
 */
@Component({
  selector: 'app-panel',
  template: `<ng-content />`,
  styleUrl: './panel.scss',
  host: {
    role: 'complementary',
    '[attr.aria-label]': 'label()',
  },
})
export class Panel {
  readonly label = input.required<string>();
}
