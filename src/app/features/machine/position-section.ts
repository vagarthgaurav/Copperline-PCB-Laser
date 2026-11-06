import { Component, computed, inject } from '@angular/core';
import { MachineService } from '../../core/machine.service';
import { formatCoordinate } from './machine-format';

/** Content of the Machine page's Position section: laser X and Y in mm on one line, or dashes when unknown. */
@Component({
  selector: 'app-position-section',
    template: `
    <div class="cells" role="group" aria-label="Laser position in millimetres">
      @for (cell of cells(); track cell.axis) {
        <dl class="cell">
          <dt class="label">{{ cell.axis }}</dt>
          <dd class="value">{{ cell.value }}</dd>
        </dl>
      }
      <span class="unit">mm</span>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .cells {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .cell {
      flex: 1;
      min-width: 0;
      margin: 0;
      padding: 4px var(--space-2);
      display: flex;
      align-items: baseline;
      gap: 6px;
      background: var(--surface-sunken);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
    }

    .label {
      margin: 0;
    }

    .value {
      margin: 0;
      font-family: var(--font-mono);
      font-size: 13px;
      line-height: 20px;
      color: var(--ink);
      white-space: nowrap;
    }

    .unit {
      font-size: 12px;
      color: var(--ink-muted);
    }
  `,
})
export class PositionSection {
  private readonly machine = inject(MachineService);

  /** Never show a position, however recent, unless the machine is connected. */
  private readonly position = computed(() =>
    this.machine.connection() === 'connected' ? this.machine.position() : null,
  );

  protected readonly cells = computed(() => [
    { axis: 'X', value: formatCoordinate(this.position()?.x) },
    { axis: 'Y', value: formatCoordinate(this.position()?.y) },
  ]);
}
