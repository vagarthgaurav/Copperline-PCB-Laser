import { Component, input } from '@angular/core';

/**
 * Label plus monospace readout, such as a position or a total time. Each tile
 * is its own one-entry description list, so tiles can be placed in any grid.
 */
@Component({
  selector: 'app-tile',
  template: `
    <dl>
      <dt class="label">{{ label() }}</dt>
      <dd class="value">
        {{ value() }}
        @if (unit(); as unit) {
          <span class="unit">{{ unit }}</span>
        }
      </dd>
    </dl>
  `,
  styleUrl: './tile.scss',
})
export class Tile {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  /** Optional muted suffix such as `mm`. */
  readonly unit = input<string>();
}
