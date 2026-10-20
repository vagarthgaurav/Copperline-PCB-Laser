import { Component, computed, inject } from '@angular/core';
import { GcodeService } from '../../core/gcode.service';
import { SimulationService } from '../../core/simulation.service';
import { EmptyNote } from '../../shell/empty-note';
import { Tile } from '../../ui/tile/tile';
import { formatClock } from './clock';

const numberFormat = new Intl.NumberFormat('en-US');

/** Content of the Dry run section: what the replay is, the estimated time and the line count. */
@Component({
  selector: 'app-dry-run-section',
  imports: [EmptyNote, Tile],
  template: `
    <p class="small help">Replays the job on the 3D board. Nothing is sent to the machine.</p>
    @if (hasGcode()) {
      <div class="tiles">
        <app-tile label="Total time" [value]="totalTime()" />
        <app-tile label="Lines" [value]="lineCount()" />
      </div>
    } @else {
      <app-empty-note>Nothing to simulate yet. Load a Gerber in Design first.</app-empty-note>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .help {
      margin: 0;
      color: var(--ink-muted);
    }

    .tiles {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-2);
    }
  `,
})
export class DryRunSection {
  private readonly gcode = inject(GcodeService);
  private readonly simulation = inject(SimulationService);

  protected readonly hasGcode = computed(() => this.gcode.lineCount() > 0);
  protected readonly totalTime = computed(() => formatClock(this.simulation.duration()));
  protected readonly lineCount = computed(() => numberFormat.format(this.gcode.lineCount()));
}
