import { Component, computed, inject } from '@angular/core';
import { SimulationService, SimulationSpeed } from '../../core/simulation.service';
import { Icon } from '../../ui/icon/icon';
import { formatClock } from './clock';

const SPEEDS: readonly SimulationSpeed[] = [1, 4, 16, 64];

let nextId = 0;

/**
 * Transport bar under the viewport: restart, step, play/pause, scrubber,
 * elapsed time and speed, bound to `SimulationService`. The "nothing is sent
 * to the machine" line is always visible. Everything else is disabled while
 * there is no G-code. Only for the dry run; live jobs use the machine bar.
 */
@Component({
  selector: 'app-simulation-controls',
  imports: [Icon],
  templateUrl: './simulation-controls.html',
  styleUrl: './simulation-controls.scss',
  host: {
    role: 'region',
    'aria-label': 'Simulation controls',
  },
})
export class SimulationControls {
  protected readonly simulation = inject(SimulationService);

  protected readonly speeds = SPEEDS;
  protected readonly speedGroupName = `simulation-speed-${nextId++}`;

  protected readonly hasJob = computed(() => this.simulation.duration() > 0);
  protected readonly atStart = computed(() => this.simulation.position() <= 0);

  protected readonly elapsed = computed(() => formatClock(this.simulation.position()));
  protected readonly total = computed(() => formatClock(this.simulation.duration()));
  protected readonly valueText = computed(() => `${this.elapsed()} of ${this.total()}`);

  /** The range input's whole-second maximum; the service clamps seeks to the real duration. */
  protected readonly sliderMax = computed(() => Math.ceil(this.simulation.duration()));
  protected readonly sliderValue = computed(() => Math.round(this.simulation.position()));

  protected onSeek(event: Event): void {
    this.simulation.seek(Number((event.target as HTMLInputElement).value));
  }
}
