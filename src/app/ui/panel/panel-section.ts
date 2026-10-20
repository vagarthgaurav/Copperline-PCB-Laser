import { Component, input } from '@angular/core';

let nextId = 0;

/**
 * A titled section inside a panel. Project optional header actions (for
 * example a ghost icon button) with the `panelActions` attribute.
 */
@Component({
  selector: 'app-panel-section',
  template: `
    <section [attr.aria-labelledby]="headingId">
      <div class="head">
        <h2 class="heading" [id]="headingId">{{ heading() }}</h2>
        <ng-content select="[panelActions]" />
      </div>
      <ng-content />
    </section>
  `,
  styleUrl: './panel-section.scss',
})
export class PanelSection {
  readonly heading = input.required<string>();
  protected readonly headingId = `panel-section-${nextId++}`;
}
