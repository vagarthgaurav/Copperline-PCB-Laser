import { Component, computed, inject } from '@angular/core';
import { EngravingService } from '../../core/engraving.service';
import { PlacementService } from '../../core/placement.service';

/** Content of the Job settings section: read-only offset, laser power, feed rate and side. */
@Component({
  selector: 'app-job-settings',
  template: `
    <dl>
      @for (row of rows(); track row.label) {
        <div class="row">
          <dt class="small">{{ row.label }}</dt>
          <dd class="code">{{ row.value }}</dd>
        </div>
      }
    </dl>
  `,
  styles: `
    :host {
      display: block;
    }

    dl {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: 0;
    }

    .row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-2);
    }

    dt {
      color: var(--ink-muted);
    }

    dd {
      margin: 0;
      color: var(--ink);
      text-align: right;
    }
  `,
})
export class JobSettings {
  private readonly placement = inject(PlacementService);
  private readonly engraving = inject(EngravingService);

  protected readonly rows = computed(() => [
    {
      label: 'Offset',
      value: `X ${this.placement.offsetX().toFixed(2)} Y ${this.placement.offsetY().toFixed(2)} mm`,
    },
    { label: 'Laser power', value: `${this.engraving.power()}%` },
    { label: 'Feed rate', value: `${this.engraving.feedRate()} mm/min` },
    { label: 'Side', value: this.placement.side() === 'top' ? 'Top' : 'Bottom' },
  ]);
}
