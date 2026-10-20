import { Service, computed, linkedSignal, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { InputFile, ParsedLayer, ParsedProject } from './gerber.types';
import { isTauri } from './tauri';

export const NEEDS_DESKTOP_MESSAGE = 'Gerber parsing needs the desktop app.';

/**
 * Holds the loaded Gerber project. `load` reads the chosen files as text and
 * hands them to the Rust command `parse_gerber_files`; the result (layers,
 * skipped files, board size) is exposed as signals. A failed load sets `error`
 * and leaves any previously loaded project in place.
 */
@Service()
export class GerberService {
  private readonly _project = signal<ParsedProject | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  /** The selected layer id: the first layer of a newly loaded project until the user picks another. */
  private readonly _selectedLayerId = linkedSignal<ParsedProject | null, string | null>({
    source: this._project,
    computation: (project) => project?.layers[0]?.id ?? null,
  });

  private loadCounter = 0;

  readonly project = this._project.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly selectedLayerId = this._selectedLayerId.asReadonly();

  readonly selectedLayer = computed<ParsedLayer | null>(() => {
    const id = this._selectedLayerId();
    return this._project()?.layers.find((layer) => layer.id === id) ?? null;
  });

  readonly board = computed(() => this._project()?.board ?? null);

  async load(files: readonly File[]): Promise<void> {
    if (files.length === 0) {
      return;
    }
    if (!isTauri()) {
      this._error.set(NEEDS_DESKTOP_MESSAGE);
      return;
    }

    const attempt = ++this.loadCounter;
    this._loading.set(true);
    this._error.set(null);
    try {
      const input: InputFile[] = await Promise.all(
        files.map(async (file) => ({ name: file.name, content: await file.text() })),
      );
      const result = await invoke<ParsedProject>('parse_gerber_files', { files: input });
      if (attempt !== this.loadCounter) {
        return;
      }
      if (result.layers.length === 0) {
        this._error.set(nothingUsableMessage(result));
      } else {
        this._project.set(result);
      }
    } catch (cause) {
      if (attempt === this.loadCounter) {
        this._error.set(`Could not load the Gerber files: ${describe(cause)}`);
      }
    } finally {
      if (attempt === this.loadCounter) {
        this._loading.set(false);
      }
    }
  }

  selectLayer(id: string): void {
    if (this._project()?.layers.some((layer) => layer.id === id)) {
      this._selectedLayerId.set(id);
    }
  }

  clearError(): void {
    this._error.set(null);
  }
}

function nothingUsableMessage(result: ParsedProject): string {
  const base = 'No usable Gerber or drill files found.';
  if (result.skipped.length === 0) {
    return base;
  }
  return `${base} ${result.skipped.map((file) => `${file.fileName}: ${file.reason}.`).join(' ')}`;
}

function describe(cause: unknown): string {
  if (typeof cause === 'string') {
    return cause;
  }
  return cause instanceof Error ? cause.message : 'unknown error';
}
