import { Component, computed, inject } from '@angular/core';
import { GcodeService } from '../../core/gcode.service';
import { MachineService } from '../../core/machine.service';
import { Banner } from '../../ui/banner/banner';
import { Button } from '../../ui/button/button';
import { Icon } from '../../ui/icon/icon';
import { formatEta, formatLineOf } from './machine-format';

/**
 * Job controls under the viewport: pause or resume, stop, home, the single
 * primary Start action and a progress bar that the text line repeats.
 */
@Component({
  selector: 'app-job-bar',
  imports: [Button, Icon, Banner],
  template: `
    <section aria-label="Job controls">
      @if (noGcode()) {
        <app-banner message="There is no G-code to engrave. Load a Gerber in Design to generate it." />
      }

      <div class="row">
        <div class="group">
          <button appButton [disabled]="!jobActive()" (click)="machine.pause()">
            <app-icon [name]="paused() ? 'play' : 'pause'" />
            {{ paused() ? 'Resume' : 'Pause' }}
          </button>
          <button appButton variant="danger" [disabled]="!jobActive()" (click)="machine.stop()">
            <app-icon name="stop" />
            Stop
          </button>
          <button appButton variant="ghost" [disabled]="!canHome()" (click)="machine.home()">
            <app-icon name="house" />
            Home
          </button>
        </div>
        <button appButton variant="primary" [disabled]="!machine.canStart()" (click)="machine.start()">
          <app-icon name="play" />
          Start engraving
        </button>
      </div>

      <div class="progress">
        <div
          class="bar"
          role="progressbar"
          aria-label="Job progress"
          aria-valuemin="0"
          [attr.aria-valuemax]="max()"
          [attr.aria-valuenow]="now()"
        >
          <i [style.width.%]="percent()"></i>
        </div>
        <p class="small text">
          {{ text() }}
          <span class="percent">{{ percent() }}%</span>
        </p>
      </div>
    </section>
  `,
  styleUrl: './job-bar.scss',
})
export class JobBar {
  protected readonly machine = inject(MachineService);
  private readonly gcode = inject(GcodeService);

  protected readonly connected = computed(() => this.machine.connection() === 'connected');
  protected readonly jobActive = computed(() => this.connected() && this.machine.jobState() !== 'idle');
  protected readonly paused = computed(() => this.machine.jobState() === 'paused');
  protected readonly canHome = computed(() => this.connected() && this.machine.jobState() === 'idle');

  /** A real blocker: the machine is ready but there is nothing to send. */
  protected readonly noGcode = computed(
    () => this.connected() && this.machine.jobState() === 'idle' && this.gcode.lineCount() === 0,
  );

  protected readonly max = computed(() => this.machine.job()?.lines ?? 100);
  protected readonly now = computed(() => this.machine.job()?.line ?? 0);
  protected readonly percent = computed(() => Math.round(this.machine.progress() * 100));

  protected readonly text = computed(() => {
    const job = this.machine.job();
    return job === null
      ? 'No job running.'
      : `${formatLineOf(job.line, job.lines)} · ETA ${formatEta(job.etaSeconds)}`;
  });
}
