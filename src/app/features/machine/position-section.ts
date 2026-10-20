import { Component, computed, inject } from '@angular/core';
import { MachineService } from '../../core/machine.service';
import { Tile } from '../../ui/tile/tile';
import { formatCoordinate } from './machine-format';

/** Content of the Machine page's Position section: laser X, Y and Z in mm, or dashes when unknown. */
@Component({
  selector: 'app-position-section',
  imports: [Tile],
  template: `
    <div class="tiles" role="group" aria-label="Laser position in millimetres">
      <app-tile label="X" unit="mm" [value]="x()" />
      <app-tile label="Y" unit="mm" [value]="y()" />
      <app-tile label="Z" unit="mm" [value]="z()" />
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .tiles {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
  `,
})
export class PositionSection {
  private readonly machine = inject(MachineService);

  /** Never show a position, however recent, unless the machine is connected. */
  private readonly position = computed(() =>
    this.machine.connection() === 'connected' ? this.machine.position() : null,
  );

  protected readonly x = computed(() => formatCoordinate(this.position()?.x));
  protected readonly y = computed(() => formatCoordinate(this.position()?.y));
  protected readonly z = computed(() => formatCoordinate(this.position()?.z));
}
