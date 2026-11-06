import { Service, computed, inject, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { UnlistenFn, listen } from '@tauri-apps/api/event';
import { MachineStatus } from '../ui/status-chip/status-chip';
import { GcodeService } from './gcode.service';
import { SentLine, nextBatch } from './job-stream';
import { PlacementService } from './placement.service';
import {
  describeAlarm,
  describeError,
  parseAlarmCode,
  parseErrorCode,
  parseSettingLine,
  parseStatusReport,
} from './machine-protocol';
import { isTauri } from './tauri';

/** grblHAL's USB serial default; the baud rate is ignored by USB CDC but required by the port API. */
export const BAUD_RATE = 115200;

/** Console lines kept in memory; older ones are dropped. */
export const MAX_CONSOLE_LINES = 500;

/** How often the machine is asked for its state and position (ms). */
export const STATUS_POLL_MS = 250;

/** How long a settings read or write waits for the machine's reply (ms). */
export const SETTINGS_REPLY_MS = 3000;

/** grblHAL real-time bytes. */
const RT_STATUS = 0x3f;
const RT_SOFT_RESET = 0x18;
const RT_FEED_HOLD = 0x21;
const RT_RESUME = 0x7e;

/** Pause between the feed hold and the reset that ends a stopped job, so the head decelerates first (ms). */
export const STOP_SETTLE_MS = 300;

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

/** How the last job ended, for the screen that started it. */
export type JobResult = { kind: 'completed' } | { kind: 'stopped' } | { kind: 'failed'; message: string };

/** Program lines being streamed; null when no job runs. */
interface Stream {
  lines: readonly string[];
  cursor: number;
  inFlight: SentLine[];
  acked: number;
  /** Set once every line was sent; the job ends when the last answer arrives. */
  total: number;
  startedAt: number;
}

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
  private readonly placement = inject(PlacementService);

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
  private readonly _jobResult = signal<JobResult | null>(null);
  private stream: Stream | null = null;
  private pumping = false;
  private unlisten: UnlistenFn[] = [];
  private readonly _settings = signal<Record<number, string>>({});
  private readonly _settingsLoading = signal(false);
  private readonly _settingsError = signal<string | null>(null);
  /** Resolves with the machine's next `ok` or `error:n` reply; null when no command waits for one. */
  private replyWaiter: ((reply: { error: number | null }) => void) | null = null;

  readonly ports = this._ports.asReadonly();
  readonly port = this._port.asReadonly();
  readonly connection = this._connection.asReadonly();
  readonly position = this._position.asReadonly();
  readonly job = this._job.asReadonly();
  readonly consoleLines = this._consoleLines.asReadonly();
  readonly jobState = this._jobState.asReadonly();
  /** How the most recent job ended; null before the first job and while one runs. */
  readonly jobResult = this._jobResult.asReadonly();
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
  /** Settings read from the machine (`$$`), by number, as the machine wrote them. Empty until read. */
  readonly settings = this._settings.asReadonly();
  /** True while the settings are being read. */
  readonly settingsLoading = this._settingsLoading.asReadonly();
  /** Why the last settings read or write failed; cleared by the next one. */
  readonly settingsError = this._settingsError.asReadonly();
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
    if (this.stream !== null) {
      this.stream = null;
      this._jobResult.set({ kind: 'stopped' });
    }
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

  /** Reads every setting with `$$`. The lines fill `settings` instead of the console. */
  async loadSettings(): Promise<void> {
    if (!isTauri() || this._connection() === 'disconnected' || this._settingsLoading()) {
      return;
    }
    this._settingsError.set(null);
    this._settingsLoading.set(true);
    this._settings.set({});
    const reply = await this.sendAndWait('$$');
    this._settingsLoading.set(false);
    if (reply === null) {
      this._settingsError.set('The machine did not answer. Try again.');
    } else if (reply.error !== null) {
      this._settingsError.set(describeError(reply.error));
    }
  }

  /** Writes one setting (`$130=375`). The machine stores it at once; returns true when it accepted it. */
  async writeSetting(id: number, value: string): Promise<boolean> {
    if (!isTauri() || this._connection() === 'disconnected' || this._settingsLoading()) {
      return false;
    }
    this._settingsError.set(null);
    const reply = await this.sendAndWait(`$${id}=${value}`);
    if (reply === null) {
      this._settingsError.set('The machine did not answer. Try again.');
      return false;
    }
    if (reply.error !== null) {
      this._settingsError.set(`$${id}: ${describeError(reply.error)}`);
      return false;
    }
    this._settings.update((settings) => ({ ...settings, [id]: value }));
    return true;
  }

  /** Sends a line and waits for the machine's `ok` or `error:n`; null on timeout. */
  private async sendAndWait(command: string): Promise<{ error: number | null } | null> {
    const reply = new Promise<{ error: number | null } | null>((resolve) => {
      const timer = setTimeout(() => {
        this.replyWaiter = null;
        resolve(null);
      }, SETTINGS_REPLY_MS);
      this.replyWaiter = (result) => {
        clearTimeout(timer);
        this.replyWaiter = null;
        resolve(result);
      };
    });
    await this.send(command);
    return reply;
  }

  private onLine(line: string): void {
    if (this.stream !== null) {
      const isOk = line.trim() === 'ok';
      const error = isOk ? null : parseErrorCode(line);
      if (isOk || error !== null) {
        this.onStreamReply(error);
        return;
      }
    }
    const waiter = this.replyWaiter;
    if (waiter !== null) {
      if (line.trim() === 'ok') {
        this.log(line);
        waiter({ error: null });
        return;
      }
      const error = parseErrorCode(line);
      if (error !== null) {
        this.log(line);
        waiter({ error });
        return;
      }
    }
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
    if (this._settingsLoading()) {
      const setting = parseSettingLine(line);
      if (setting !== null) {
        // A `$$` answer has about a hundred lines; keep them out of the console.
        this._settings.update((settings) => ({ ...settings, [setting.id]: setting.value }));
        return;
      }
    }
    const code = parseAlarmCode(line);
    if (code !== null) {
      this._alarmCode.set(code);
      this._machineState.set('Alarm');
      if (this.stream !== null) {
        this.stream = null;
        this._jobState.set('idle');
        this._job.set(null);
        this._jobResult.set({ kind: 'failed', message: describeAlarm(code) });
      }
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
    this._settings.set({});
    this._settingsLoading.set(false);
    this.replyWaiter?.({ error: 3 });
    if (this.stream !== null) {
      this.stream = null;
      this._job.set(null);
      this._jobResult.set({ kind: 'failed', message: 'The connection to the machine was lost.' });
    }
    this._connection.set('disconnected');
    this._jobState.set('idle');
    this._position.set(null);
    await this.refreshPorts();
  }

  /** Streams the G-code to the machine. Does nothing unless `canStart()`. */
  start(): void {
    if (!this.canStart()) {
      return;
    }
    const lines = this.gcode.lines();
    this.stream = { lines, cursor: 0, inFlight: [], acked: 0, total: lines.length, startedAt: Date.now() };
    this._jobResult.set(null);
    this._jobState.set('running');
    this.gcode.setCurrentLine(0);
    this.publishProgress();
    this.log(`Job started: ${lines.length} lines`);
    void this.pump();
  }

  /** Feed hold, or resume when already held. Motion stops within the machine's deceleration. */
  pause(): void {
    if (this.stream === null) {
      return;
    }
    if (this._jobState() === 'running') {
      this._jobState.set('paused');
      void this.sendRealtime(RT_FEED_HOLD);
    } else if (this._jobState() === 'paused') {
      this._jobState.set('running');
      void this.sendRealtime(RT_RESUME);
    }
  }

  /** Ends the job: feed hold, then a soft reset that switches the laser off. The machine keeps its position. */
  stop(): void {
    if (this.stream === null) {
      return;
    }
    void this.haltJob({ kind: 'stopped' });
  }

  private async haltJob(result: JobResult): Promise<void> {
    this.stream = null;
    this._jobResult.set(result);
    this._jobState.set('idle');
    this._job.set(null);
    this.log(result.kind === 'failed' ? `Job failed: ${result.message}` : 'Job stopped');
    await this.sendRealtime(RT_FEED_HOLD);
    await new Promise((resolve) => setTimeout(resolve, STOP_SETTLE_MS));
    await this.sendRealtime(RT_SOFT_RESET);
  }

  /** Sends what fits in the receive buffer. Runs again after every answer from the machine. */
  private async pump(): Promise<void> {
    if (this.pumping) {
      return;
    }
    this.pumping = true;
    try {
      for (let stream = this.stream; stream !== null; stream = this.stream) {
        const inFlight = stream.inFlight.reduce((sum, line) => sum + line.bytes, 0);
        const batch = nextBatch(stream.lines, stream.cursor, inFlight);
        if (batch.text === '') {
          break;
        }
        stream.cursor = batch.cursor;
        stream.inFlight.push(...batch.sent);
        await invoke('serial_write', { data: batch.text });
      }
      this.finishIfDone();
    } catch (error) {
      if (this.stream !== null) {
        void this.haltJob({ kind: 'failed', message: messageOf(error) });
      }
    } finally {
      this.pumping = false;
    }
  }

  /** One `ok` or `error:n` answers the oldest line in flight. */
  private onStreamReply(error: number | null): void {
    const stream = this.stream;
    if (stream === null) {
      return;
    }
    const done = stream.inFlight.shift();
    if (done !== undefined) {
      stream.acked = done.index + 1;
    }
    this.publishProgress();
    if (error !== null) {
      const line = done === undefined ? '' : ` on line ${done.index + 1}`;
      void this.haltJob({ kind: 'failed', message: `${describeError(error)}${line}` });
      return;
    }
    if (!this.finishIfDone()) {
      void this.pump();
    }
  }

  private finishIfDone(): boolean {
    const stream = this.stream;
    if (stream === null || stream.cursor < stream.total || stream.inFlight.length > 0) {
      return false;
    }
    this.stream = null;
    this.gcode.setCurrentLine(stream.total);
    this._job.set(null);
    this._jobState.set('idle');
    this._jobResult.set({ kind: 'completed' });
    this.log('Job finished');
    return true;
  }

  private publishProgress(): void {
    const stream = this.stream;
    if (stream === null) {
      return;
    }
    this.gcode.setCurrentLine(stream.acked);
    const fraction = stream.total > 0 ? stream.acked / stream.total : 0;
    const estimate = this.gcode.stats()?.estimatedSeconds ?? 0;
    this._job.set({
      name: 'Board',
      side: this.placement.side() === 'top' ? 'Top' : 'Bottom',
      line: stream.acked,
      lines: stream.total,
      etaSeconds: Math.max(0, Math.round(estimate * (1 - fraction))),
    });
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
