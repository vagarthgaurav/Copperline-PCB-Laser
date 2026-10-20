import { Component, computed, inject } from '@angular/core';
import { GerberService } from '../../core/gerber.service';
import { PlacementService } from '../../core/placement.service';
import { EmptyNote } from '../../shell/empty-note';
import { Tile } from '../../ui/tile/tile';

/** Two decimals, zero padded to three integer digits: 12.5 becomes "012.50". */
export function formatOffset(value: number): string {
  const digits = Math.abs(value).toFixed(2).padStart(6, '0');
  return value < 0 && Number(digits) !== 0 ? `-${digits}` : digits;
}

/** Content of the Design page's right Placement section: the offset as two readout tiles. */
@Component({
  selector: 'app-placement-readout',
  imports: [Tile, EmptyNote],
  template: `
    @if (loaded()) {
      <div class="tiles">
        <app-tile label="Offset X" [value]="x()" unit="mm" />
        <app-tile label="Offset Y" [value]="y()" unit="mm" />
      </div>
      <p class="small muted">Offset is added to every move in the exported G-code.</p>
    } @else {
      <app-empty-note>No board placed. The offset appears here once a Gerber is loaded.</app-empty-note>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .tiles {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-2);
    }

    p {
      margin: 0;
    }

    .muted {
      color: var(--ink-muted);
    }
  `,
})
export class PlacementReadout {
  private readonly placement = inject(PlacementService);
  private readonly gerber = inject(GerberService);

  protected readonly loaded = computed(() => this.gerber.project() !== null);
  protected readonly x = computed(() => formatOffset(this.placement.offsetX()));
  protected readonly y = computed(() => formatOffset(this.placement.offsetY()));
}
