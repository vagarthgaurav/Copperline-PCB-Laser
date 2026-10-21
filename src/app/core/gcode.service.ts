import { Service, computed, inject, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { EngravingService } from './engraving.service';
import { GcodePoint, traceGcode } from './gcode-path';
import { GcodeOutput, GcodeRequest, GcodeStats } from './gcode.types';
import { GerberService } from './gerber.service';
import { ParsedProject } from './gerber.types';
import { PlacementService } from './placement.service';
import { isTauri } from './tauri';

export type { GcodePoint } from './gcode-path';

/** The S value for 100 % power (grblHAL `$30` default). */
export const SPINDLE_MAX = 1000;

/**
 * The generated G-code and the line the viewer highlights. `generate` asks
 * the Rust command `generate_gcode` (which keeps the parsed project) for the
 * program on demand; `stale` says when the inputs changed since. `setLines` still sets the lines directly.
 */
@Service()
export class GcodeService {
  private readonly _lines = signal<readonly string[]>([]);
  private readonly _currentLine = signal(0);
  private readonly _generating = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _stats = signal<GcodeStats | null>(null);
  private readonly _warnings = signal<string[]>([]);

  private readonly gerber = inject(GerberService);
  private readonly placement = inject(PlacementService);
  private readonly engraving = inject(EngravingService);

  private generateCounter = 0;
  /** The request and project behind the current generated lines, or null. */
  private readonly lastGenerated = signal<{ key: string; project: ParsedProject | null } | null>(null);
  /** True while `_lines` holds output of `generate` rather than `setLines`. */
  private linesAreGenerated = false;

  readonly lines = this._lines.asReadonly();
  readonly lineCount = computed(() => this._lines().length);

  /** True while a generation request is in flight. */
  readonly generating = this._generating.asReadonly();
  /** Why the last generation failed, or null. */
  readonly error = this._error.asReadonly();
  /** Length and time figures for the current program, or null. */
  readonly stats = this._stats.asReadonly();
  /** Non-fatal notes from the generator. */
  readonly warnings = this._warnings.asReadonly();

  /** 1-based line being shown or executed; 0 means none. */
  readonly currentLine = this._currentLine.asReadonly();

  private readonly trace = computed(() => traceGcode(this._lines()));

  /** Tool position after the current line, or null when nothing has moved yet. */
  readonly currentPosition = computed(() => this.positionAt(this._currentLine()));

  /** True when the generated program no longer matches the project, placement or laser settings. */
  readonly stale = computed(() => {
    const last = this.lastGenerated();
    if (last === null) {
      return false;
    }
    return last.project !== this.gerber.project() || last.key !== JSON.stringify(this.buildRequest());
  });

  /**
   * Generates the program for the loaded project with the current placement
   * and laser settings. The newest call wins: a response that arrives after a
   * later call started is dropped. Without a project the generated lines are
   * cleared; outside Tauri nothing happens (the Gerber load reports that).
   */
  async generate(): Promise<void> {
    const attempt = ++this.generateCounter;
    if (this.gerber.project() === null || !isTauri()) {
      this._generating.set(false);
      this._error.set(null);
      this.clearGenerated();
      return;
    }

    const project = this.gerber.project();
    const request = this.buildRequest();
    const key = JSON.stringify(request);
    this._generating.set(true);
    this._error.set(null);
    try {
      const output = await invoke<GcodeOutput>('generate_gcode', { request });
      if (attempt !== this.generateCounter) {
        return;
      }
      this.setLines(output.lines);
      this.linesAreGenerated = true;
      this.lastGenerated.set({ key, project });
      this._stats.set(output.stats);
      this._warnings.set(output.warnings);
    } catch (cause) {
      if (attempt === this.generateCounter) {
        this._error.set(describe(cause));
        this.clearGenerated(true);
      }
    } finally {
      if (attempt === this.generateCounter) {
        this._generating.set(false);
      }
    }
  }

  private buildRequest(): GcodeRequest {
    return {
      dialect: 'grblHal',
      side: this.placement.side(),
      placement: {
        offsetX: this.placement.offsetX(),
        offsetY: this.placement.offsetY(),
        quarterTurns: this.placement.quarterTurns(),
      },
      powerPercent: this.engraving.power(),
      feedRate: this.engraving.feedRate(),
      spotDiameter: this.engraving.spotDiameter(),
      isolationPasses: this.engraving.isolationPasses(),
      passOverlap: this.engraving.passOverlap(),
      spindleMax: SPINDLE_MAX,
    };
  }

  setLines(lines: readonly string[]): void {
    this.linesAreGenerated = false;
    this.lastGenerated.set(null);
    this._lines.set(lines);
    this._currentLine.update((line) => Math.min(line, lines.length));
  }

  setCurrentLine(line: number): void {
    if (Number.isFinite(line)) {
      this._currentLine.set(Math.min(this._lines().length, Math.max(0, Math.round(line))));
    }
  }

  /**
   * X/Y position after executing lines 1..`line` (1-based), reading G0/G1
   * modally. Null when `line` is outside the program or no X/Y was seen yet.
   */
  positionAt(line: number): GcodePoint | null {
    const positions = this.trace().positions;
    const index = Math.min(Math.floor(line), positions.length) - 1;
    return index >= 0 ? positions[index] : null;
  }

  /**
   * Saves the G-code as a file. There is no Tauri dialog/fs plugin installed,
   * so this uses a Blob download. Does nothing when there are no lines.
   */
  exportToFile(fileName = 'copperline.gcode'): void {
    const lines = this._lines();
    if (lines.length === 0) {
      return;
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  /** Drops the generated program, its figures and notes. Lines from `setLines` stay unless `always`. */
  private clearGenerated(always = false): void {
    this._stats.set(null);
    this._warnings.set([]);
    if (always || this.linesAreGenerated) {
      this.linesAreGenerated = false;
      this.setLines([]);
    }
  }
}

function describe(cause: unknown): string {
  if (typeof cause === 'string') {
    return cause;
  }
  return cause instanceof Error ? cause.message : 'Could not generate G-code.';
}
