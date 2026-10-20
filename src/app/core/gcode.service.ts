import { Service, computed, signal } from '@angular/core';
import { GcodePoint, traceGcode } from './gcode-path';

export type { GcodePoint } from './gcode-path';

/**
 * The generated G-code and the line the viewer highlights. There is no
 * generator yet, so `lines` stays empty until `setLines` is called.
 */
@Service()
export class GcodeService {
  private readonly _lines = signal<readonly string[]>([]);
  private readonly _currentLine = signal(0);

  readonly lines = this._lines.asReadonly();
  readonly lineCount = computed(() => this._lines().length);

  /** 1-based line being shown or executed; 0 means none. */
  readonly currentLine = this._currentLine.asReadonly();

  private readonly trace = computed(() => traceGcode(this._lines()));

  /** Tool position after the current line, or null when nothing has moved yet. */
  readonly currentPosition = computed(() => this.positionAt(this._currentLine()));

  setLines(lines: readonly string[]): void {
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
}
