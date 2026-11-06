import { Service, computed, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '@app/core/tauri';

export interface UsbDrive {
  name: string;
  path: string;
}

export interface UsbEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
}

/** How often the list of drives is refreshed while the browser is open (ms). */
export const DRIVE_POLL_MS = 2000;

const GERBER_EXTENSIONS = new Set([
  'gbr', 'ger', 'gtl', 'gbl', 'gts', 'gbs', 'gto', 'gbo', 'gko', 'gm1', 'gml', 'drl', 'xln', 'exc', 'txt', 'zip',
]);

/** True for the files Copperline can read: Gerber and Excellon files, and zips of them. */
export function isGerberFile(name: string): boolean {
  const dot = name.lastIndexOf('.');
  return dot > 0 && GERBER_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/** The folder above `path`, or null when that would leave `root`. */
export function parentWithin(root: string, path: string): string | null {
  if (path === root || !path.startsWith(root)) {
    return null;
  }
  const cut = path.lastIndexOf('/');
  const parent = cut <= 0 ? '/' : path.slice(0, cut);
  return parent.length < root.length ? null : parent;
}

function messageOf(error: unknown): string {
  return typeof error === 'string' ? error : error instanceof Error ? error.message : 'Unknown error';
}

/**
 * Browses the plugged-in USB drives through the Rust commands in `usb.rs`.
 * Only folders and Gerber-type files are listed. `readFiles` returns `File`
 * objects so the normal `GerberService.load` can take them.
 */
@Service()
export class UsbService {
  private readonly _drives = signal<UsbDrive[]>([]);
  private readonly _root = signal<string | null>(null);
  private readonly _path = signal<string | null>(null);
  private readonly _entries = signal<UsbEntry[]>([]);
  private readonly _error = signal<string | null>(null);
  private readonly _loading = signal(false);
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private listCounter = 0;

  readonly drives = this._drives.asReadonly();
  /** The folder being shown; null shows the list of drives. */
  readonly path = this._path.asReadonly();
  readonly entries = this._entries.asReadonly();
  readonly error = this._error.asReadonly();
  readonly loading = this._loading.asReadonly();
  /** The place to go back to; null at the list of drives. */
  readonly canGoUp = computed(() => this._path() !== null);

  /** Starts watching for drives. Call `stopWatching` when the browser closes. */
  startWatching(): void {
    this.stopWatching();
    void this.refreshDrives();
    this.pollTimer = setInterval(() => void this.refreshDrives(), DRIVE_POLL_MS);
  }

  stopWatching(): void {
    clearInterval(this.pollTimer);
    this.pollTimer = undefined;
  }

  async refreshDrives(): Promise<void> {
    if (!isTauri()) {
      return;
    }
    try {
      const drives = await invoke<UsbDrive[]>('list_usb_drives');
      this._drives.set(drives);
      const root = this._root();
      if (root !== null && !drives.some((drive) => drive.path === root)) {
        // The stick was pulled out.
        this.reset();
      } else if (root === null && drives.length === 1 && this._path() === null) {
        await this.openDrive(drives[0]);
      }
    } catch (error) {
      this._error.set(messageOf(error));
    }
  }

  async openDrive(drive: UsbDrive): Promise<void> {
    this._root.set(drive.path);
    await this.openDir(drive.path);
  }

  async openDir(path: string): Promise<void> {
    const attempt = ++this.listCounter;
    this._loading.set(true);
    this._error.set(null);
    try {
      const all = await invoke<UsbEntry[]>('list_usb_dir', { path });
      if (attempt === this.listCounter) {
        this._entries.set(all.filter((entry) => entry.isDir || isGerberFile(entry.name)));
        this._path.set(path);
      }
    } catch (error) {
      if (attempt === this.listCounter) {
        this._error.set(messageOf(error));
      }
    } finally {
      if (attempt === this.listCounter) {
        this._loading.set(false);
      }
    }
  }

  /** One folder up, or back to the list of drives from the top of a drive. */
  async up(): Promise<void> {
    const root = this._root();
    const path = this._path();
    if (root === null || path === null) {
      return;
    }
    const parent = parentWithin(root, path);
    if (parent === null) {
      this.reset();
    } else {
      await this.openDir(parent);
    }
  }

  /** Reads the chosen files from the drive. */
  async readFiles(entries: readonly UsbEntry[]): Promise<File[]> {
    return Promise.all(
      entries.map(async (entry) => new File([await invoke<ArrayBuffer>('read_usb_file', { path: entry.path })], entry.name)),
    );
  }

  private reset(): void {
    this.listCounter++;
    this._root.set(null);
    this._path.set(null);
    this._entries.set([]);
    this._loading.set(false);
  }
}
