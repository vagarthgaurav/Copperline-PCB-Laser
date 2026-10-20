import { Service, computed, inject, signal } from '@angular/core';
import { MachineStatus } from '../ui/status-chip/status-chip';
import { GcodeService } from './gcode.service';

export type MachineConnection = 'disconnected' | 'connected';
export type JobState = 'idle' | 'running' | 'paused';

export interface MachinePosition {
  x: number;
  y: number;
  z: number;
}

export interface MachineJob {
  name: string;
  side: 'Top' | 'Bottom';
  /** Line being executed. */
  line: number;
  /** Total lines in the job. */
  lines: number;
  etaSeconds: number;
}

export interface MachineState {
  ports: string[];
  port: string;
  connection: MachineConnection;
  position: MachinePosition | null;
  job: MachineJob | null;
  consoleLines: string[];
  jobState: JobState;
}

/**
 * State of the laser machine for the Machine page and the title bar.
 * The serial layer is a later Rust task, so nothing here talks to hardware:
 * the actions are no-ops and the state stays at its defaults until
 * `applyState` is called.
 */
@Service()
export class MachineService {
  private readonly gcode = inject(GcodeService);

  private readonly _ports = signal<string[]>([]);
  private readonly _port = signal('');
  private readonly _connection = signal<MachineConnection>('disconnected');
  private readonly _position = signal<MachinePosition | null>(null);
  private readonly _job = signal<MachineJob | null>(null);
  private readonly _consoleLines = signal<string[]>([]);
  private readonly _jobState = signal<JobState>('idle');

  readonly ports = this._ports.asReadonly();
  readonly port = this._port.asReadonly();
  readonly connection = this._connection.asReadonly();
  readonly position = this._position.asReadonly();
  readonly job = this._job.asReadonly();
  readonly consoleLines = this._consoleLines.asReadonly();
  readonly jobState = this._jobState.asReadonly();

  readonly status = computed<MachineStatus>(() => {
    if (this._connection() === 'disconnected') {
      return 'disconnected';
    }
    switch (this._jobState()) {
      case 'running':
        return 'engraving';
      case 'paused':
        return 'paused';
      default:
        return 'connected';
    }
  });

  /** 0..1 through the running job; 0 when there is none. */
  readonly progress = computed(() => {
    const job = this._job();
    if (job === null || job.lines <= 0) {
      return 0;
    }
    return Math.min(1, Math.max(0, job.line / job.lines));
  });

  readonly canStart = computed(
    () =>
      this._connection() === 'connected' &&
      this._jobState() === 'idle' &&
      this.gcode.lineCount() > 0,
  );

  selectPort(port: string): void {
    this._port.set(port);
  }

  connect(): void {
    // TODO(serial): implemented by the Rust serial commands
  }

  disconnect(): void {
    // TODO(serial): implemented by the Rust serial commands
  }

  start(): void {
    // TODO(serial): implemented by the Rust serial commands
  }

  pause(): void {
    // TODO(serial): implemented by the Rust serial commands
  }

  stop(): void {
    // TODO(serial): implemented by the Rust serial commands
  }

  home(): void {
    // TODO(serial): implemented by the Rust serial commands
  }

  /** Used by the serial layer and tests to update the machine state. */
  applyState(partial: Partial<MachineState>): void {
    if (partial.ports !== undefined) {
      this._ports.set(partial.ports);
    }
    if (partial.port !== undefined) {
      this._port.set(partial.port);
    }
    if (partial.connection !== undefined) {
      this._connection.set(partial.connection);
    }
    if (partial.position !== undefined) {
      this._position.set(partial.position);
    }
    if (partial.job !== undefined) {
      this._job.set(partial.job);
    }
    if (partial.consoleLines !== undefined) {
      this._consoleLines.set(partial.consoleLines);
    }
    if (partial.jobState !== undefined) {
      this._jobState.set(partial.jobState);
    }
  }
}
