import { Service, computed, inject, signal } from '@angular/core';
import { GcodeService } from '@app/core/gcode.service';
import { GerberService } from '@app/core/gerber.service';
import { MachineService } from '@app/core/machine.service';

/**
 * The kiosk's Start button: ask first, make sure the G-code matches what is on
 * screen, then stream it. Stop goes straight to the machine with no question.
 */
@Service()
export class JobControl {
  private readonly gerber = inject(GerberService);
  private readonly gcode = inject(GcodeService);
  private readonly machine = inject(MachineService);

  private readonly _confirming = signal(false);
  private readonly _preparing = signal(false);
  private readonly _error = signal<string | null>(null);

  /** True while the "Start engraving?" question is on screen. */
  readonly confirming = this._confirming.asReadonly();
  /** True while the G-code is being generated after the user said yes. */
  readonly preparing = this._preparing.asReadonly();
  readonly error = this._error.asReadonly();

  /** A board is loaded and the machine is connected, idle and not in alarm. */
  readonly canStart = computed(
    () =>
      this.gerber.project() !== null &&
      this.machine.connection() === 'connected' &&
      this.machine.jobState() === 'idle' &&
      !this.machine.alarm() &&
      !this._preparing(),
  );

  /** Why Start is off, in words for the person at the machine; null when it is on. */
  readonly startBlocker = computed<string | null>(() => {
    if (this.gerber.project() === null) {
      return 'Open a board from the USB stick first.';
    }
    if (this.machine.connection() !== 'connected') {
      return 'The machine is not connected.';
    }
    if (this.machine.alarm()) {
      return 'The machine is locked. Unlock it, then home it.';
    }
    return null;
  });

  readonly canStop = computed(() => this.machine.jobState() !== 'idle');

  requestStart(): void {
    if (this.canStart()) {
      this._error.set(null);
      this._confirming.set(true);
    }
  }

  cancel(): void {
    if (!this._preparing()) {
      this._confirming.set(false);
    }
  }

  async confirmStart(): Promise<void> {
    if (this._preparing() || !this.canStart()) {
      this._confirming.set(false);
      return;
    }
    this._preparing.set(true);
    try {
      if (this.gcode.lineCount() === 0 || this.gcode.stale()) {
        await this.gcode.generate();
      }
      if (this.gcode.lineCount() === 0) {
        this._error.set(this.gcode.error() ?? 'Could not make the G-code for this board.');
        return;
      }
      this.machine.start();
    } finally {
      this._preparing.set(false);
      this._confirming.set(false);
    }
  }

  stop(): void {
    this.machine.stop();
  }
}
