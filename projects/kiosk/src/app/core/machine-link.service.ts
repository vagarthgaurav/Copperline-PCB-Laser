import { Service, effect, inject } from '@angular/core';
import { MachineService } from '@app/core/machine.service';
import { isTauri } from '@app/core/tauri';
import { AdminService } from './admin.service';

export const PORT_STORAGE_KEY = 'copperline.kiosk.port';

/** How often a lost or missing machine connection is retried (ms). */
export const RECONNECT_MS = 3000;

function readStoredPort(): string {
  try {
    return localStorage.getItem(PORT_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function storePort(port: string): void {
  try {
    localStorage.setItem(PORT_STORAGE_KEY, port);
  } catch {
    // Storage unavailable; the next start picks the first USB port again.
  }
}

/**
 * Keeps the machine connected without the user touching a Connect button.
 * Every `RECONNECT_MS` it connects to the last working port (else the first
 * USB serial port). It stands down while the admin tabs are open, so someone
 * who disconnects on purpose to change settings is not reconnected.
 */
@Service()
export class MachineLink {
  private readonly machine = inject(MachineService);
  private readonly admin = inject(AdminService);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    effect(() => {
      if (this.machine.connection() === 'connected' && this.machine.port() !== '') {
        storePort(this.machine.port());
      }
    });
  }

  start(): void {
    if (this.timer !== undefined || !isTauri()) {
      return;
    }
    void this.tick();
    this.timer = setInterval(() => void this.tick(), RECONNECT_MS);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private async tick(): Promise<void> {
    if (this.admin.unlocked() || this.machine.connection() === 'connected' || this.machine.busy()) {
      return;
    }
    await this.machine.refreshPorts();
    const ports = this.machine.ports();
    if (ports.length === 0) {
      return;
    }
    const stored = readStoredPort();
    this.machine.selectPort(ports.includes(stored) ? stored : ports[0]);
    await this.machine.connect();
  }
}
