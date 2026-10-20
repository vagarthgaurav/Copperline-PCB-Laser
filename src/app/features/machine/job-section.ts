import { Component, computed, inject } from '@angular/core';
import { MachineService } from '../../core/machine.service';
import { EmptyNote } from '../../shell/empty-note';
import { formatEta, formatLineOf } from './machine-format';

/** Content of the Machine page's Job section: job name, side and where the run is. */
@Component({
  selector: 'app-job-section',
  imports: [EmptyNote],
  template: `
    @if (machine.job(); as job) {
      <p class="name body-strong">{{ job.name }} · {{ job.side }} side</p>
      <p class="summary small">{{ summary() }}</p>
    } @else {
      <app-empty-note>No job running. Load a Gerber in Design to prepare one.</app-empty-note>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    p {
      margin: 0;
    }

    .name {
      overflow-wrap: anywhere;
    }

    .summary {
      color: var(--ink-muted);
    }
  `,
})
export class JobSection {
  protected readonly machine = inject(MachineService);

  protected readonly summary = computed(() => {
    const job = this.machine.job();
    return job === null ? '' : `${formatLineOf(job.line, job.lines)} · ETA ${formatEta(job.etaSeconds)}`;
  });
}
