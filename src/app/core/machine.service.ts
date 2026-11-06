import { Service, computed, inject, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { UnlistenFn, listen } from '@tauri-apps/api/event';
import { MachineStatus } from '../ui/status-chip/status-chip';
import { GcodeService } from './gcode.service';
import { describeAlarm, parseAlarmCode, parseStatusReport } from './machine-protocol';
import { isTauri } from './tauri';

/** grblHAL's USB serial default; the baud rate is ignored by USB CDC but required by the port API. */
export const BAUD_RATE = 115200;

/** Console lines kept in memory; older ones are dropped. */
export const MAX_CONSOLE_LINES = 500;

/** How often the machine is asked for its state and position (ms). */
export const STATUS_POLL_MS = 250;

/** grblHAL real-time bytes. */
const RT_STATUS = 0x3f;
const RT_SOFT_RESET = 0x18;

function messageOf(error: unknown): string {
  return typeof error === 'string' ? error : error instanceof Error ? error.message : 'Unknown error';
}

export type MachineConnection = 'disconnected' | 'connected';
export type JogAxis = 'X' | 'Y';

/** Jog distances (mm) offered on the Machine page. */
export const JOG_STEPS = [0.1, 1, 10, 50] as const;

/** The `$J=` jog command for one relative move; grblHAL rejects it while an alarm or a job is active. */
export function jogCommand(axis: JogAxis, distance: number, feed: number): string {
  return `$J=G21G91${axis}${Number(distance.toFixed(3))}F${feed}`;
}

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
 * Ports, connection and the console talk to the Rust serial commands; job
 * control (start, pause, stop, home) and live position are still to do.
 * Outside Tauri there is no serial access, so nothing happens there.
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
  private readonly _machineState = signal<string | null>(null);
  private readonly _alarmCode = signal<number | null>(null);
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private readonly _jogStep = signal<number>(1);
  private readonly _jogFeed = signal(1000);
  private readonly _error = signal<string | null>(null);
  private readonly _busy = signal(false);
  private unlisten: UnlistenFn[] = [];

  readonly ports = this._ports.asReadonly();
  readonly port = this._port.asReadonly();
  readonly connection = this._connection.asReadonly();
  readonly position = this._position.asReadonly();
  readonly job = this._job.asReadonly();
  readonly consoleLines = this._consoleLines.asReadonly();
  readonly jobState = this._jobState.asReadonly();
  /** The state grblHAL last reported (`Idle`, `Run`, `Alarm`, ...), or null before the first report. */
  readonly machineState = this._machineState.asReadonly();
  /** True while the machine reports an alarm: it is locked and refuses motion until unlocked. */
  readonly alarm = computed(() => this._machineState() === 'Alarm');
  /** Why the machine is in alarm, in words. */
  readonly alarmText = computed(() => describeAlarm(this._alarmCode()));
  /** Distance of one jog click, mm. */
  readonly jogStep = this._jogStep.asReadonly();
  /** Feed rate of a jog, mm/min. */
  readonly jogFeed = this._jogFeed.asReadonly();
  /** Why the last port, connect or send action failed; cleared by the next one. */
  readonly error = this._error.asReadonly();
  /** True while a connect or disconnect is under way. */
  readonly busy = this._busy.asReadonly();

  readonly status = computed<MachineStatus>(() => {
    if (this._connection() === 'disconnected') {
      return 'disconnected';
    }
    if (this.alarm()) {
      return 'fault';
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

  /** Homing and jogging need a connected, idle machine. */
  readonly canMove = computed(
    () => this._connection() === 'connected' && this._jobState() === 'idle' && !this.alarm(),
  );

  readonly canStart = computed(
    () =>
      this._connection() === 'connected' &&
      this._jobState() === 'idle' &&
      !this.alarm() &&
      this.gcode.lineCount() > 0,
  );

  setJogStep(step: number): void {
    if (Number.isFinite(step) && step > 0) {
      this._jogStep.set(step);
    }
  }

  setJogFeed(feed: number): void {
    if (Number.isFinite(feed) && feed > 0) {
      this._jogFeed.set(Math.round(feed));
    }
  }

  selectPort(port: string): void {
    this._port.set(port);
  }

  /** Reads the serial ports from the OS and picks the only one when there is just one. */
  async refreshPorts(): Promise<void> {
    if (!isTauri()) {
      return;
    }
    try {
      const ports = await invoke<string[]>('list_serial_ports');
      this._ports.set(ports);
      if (this._connection() === 'disconnected') {
        if (!ports.includes(this._port())) {
          this._port.set(ports.length === 1 ? ports[0] : '');
        }
      }
    } catch (error) {
      this._error.set(messageOf(error));
    }
  }

  async connect(): Promise<void> {
    const port = this._port();
    if (!isTauri() || port === '' || this._connection() === 'connected' || this._busy()) {
      return;
    }
    this._busy.set(true);
    this._error.set(null);
    try {
      this.unlisten = [
        await listen<string>('serial-line', (event) => this.onLine(event.payload)),
        await listen<string>('serial-closed', (event) => {
          this.log(event.payload);
          this._error.set(event.payload);
          void this.closeLocally();
        }),
      ];
      await invoke('serial_connect', { port, baud: BAUD_RATE });
      this._connection.set('connected');
      this.log(`Connected to ${port}`);
      this.startPolling();
      // Version query: harmless, and proves the link by showing grblHAL's answer.
      await this.send('$I');
    } catch (error) {
      this._error.set(messageOf(error));
      this.stopListening();
    } finally {
      this._busy.set(false);
    }
  }

  async disconnect(): Promise<void> {
    if (!isTauri() || this._connection() === 'disconnected' || this._busy()) {
      return;
    }
    this._busy.set(true);
    try {
      await invoke('serial_disconnect');
      this.log('Disconnected');
    } catch (error) {
      this._error.set(messageOf(error));
    } finally {
      await this.closeLocally();
      this._busy.set(false);
    }
  }

  /** Sends one line to the machine and echoes it in the console. */
  async send(command: string): Promise<void> {
    const line = command.trim();
    if (!isTauri() || line === '' || this._connection() === 'disconnected') {
      return;
    }
    this.log(`> ${line}`);
    try {
      await invoke('serial_write', { data: `${line}\n` });
    } catch (error) {
      this._error.set(messageOf(error));
    }
  }

  /** Emergency stop: a soft reset (0x18) that halts motion and the laser at once. Works whenever connected. */
  async emergencyStop(): Promise<void> {
    if (!isTauri() || this._connection() === 'disconnected') {
      return;
    }
    this.log('> Emergency stop (soft reset)');
    this._jobState.set('idle');
    this._job.set(null);
    await this.sendRealtime(RT_SOFT_RESET);
  }

  /** Clears the alarm lock (`$X`). */
  unlock(): void {
    if (this.alarm()) {
      void this.send('$X');
    }
  }

  private onLine(line: string): void {
    const report = parseStatusReport(line);
    if (report !== null) {
      // Status reports arrive several times a second; they feed the UI, not the console.
      this._machineState.set(report.state);
      if (report.state !== 'Alarm') {
        this._alarmCode.set(null);
      }
      if (report.position !== null) {
        this._position.set(report.position);
      }
      return;
    }
    const code = parseAlarmCode(line);
    if (code !== null) {
      this._alarmCode.set(code);
      this._machineState.set('Alarm');
    }
    this.log(line);
  }

  private async sendRealtime(byte: number): Promise<void> {
    try {
      await invoke('serial_write_realtime', { byte });
    } catch (error) {
      this._error.set(messageOf(error));
    }
  }

  private startPolling(): void {
    this.stopPolling();
    void this.sendRealtime(RT_STATUS);
    this.pollTimer = setInterval(() => void this.sendRealtime(RT_STATUS), STATUS_POLL_MS);
  }

  private stopPolling(): void {
    clearInterval(this.pollTimer);
    this.pollTimer = undefined;
  }

  private log(line: string): void {
    this._consoleLines.update((lines) => [...lines, line].slice(-MAX_CONSOLE_LINES));
  }

  private stopListening(): void {
    for (const unlisten of this.unlisten) {
      unlisten();
    }
    this.unlisten = [];
  }

  private async closeLocally(): Promise<void> {
    this.stopListening();
    this.stopPolling();
    this._machineState.set(null);
    this._alarmCode.set(null);
    this._connection.set('disconnected');
    this._jobState.set('idle');
    this._position.set(null);
    await this.refreshPorts();
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

  /** Runs the homing cycle (`$H`). */
  home(): void {
    if (this.canMove()) {
      void this.send('$H');
    }
  }

  /** Homes one axis (`$HX` or `$HY`; grblHAL only). */
  homeAxis(axis: JogAxis): void {
    if (this.canMove()) {
      void this.send(`$H${axis}`);
    }
  }

  /** Moves one axis by the jog step, `direction` 1 (positive) or -1. */
  jog(axis: JogAxis, direction: 1 | -1): void {
    if (this.canMove()) {
      void this.send(jogCommand(axis, direction * this._jogStep(), this._jogFeed()));
    }
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
