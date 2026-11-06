import { Service, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '@app/core/tauri';

/** Minutes without a touch before the admin tabs lock again. */
export const ADMIN_IDLE_MINUTES = 5;

/** Used in a plain browser (`ng serve`), where there is no Rust side to ask. Same as the kiosk's factory default. */
const DEV_PASSWORD = 'copperline';

/**
 * Whether the Simulate and Machine tabs are open. The password is checked by
 * the Rust command `verify_admin_password`; the page never sees the stored
 * hash. The tabs lock again after `ADMIN_IDLE_MINUTES` without a touch.
 */
@Service()
export class AdminService {
  private readonly _unlocked = signal(false);
  private idleTimer: ReturnType<typeof setTimeout> | undefined;

  readonly unlocked = this._unlocked.asReadonly();

  /** Resolves true and opens the tabs when the password is right. */
  async unlock(password: string): Promise<boolean> {
    let ok = false;
    try {
      ok = isTauri() ? await invoke<boolean>('verify_admin_password', { password }) : password === DEV_PASSWORD;
    } catch {
      ok = false;
    }
    if (ok) {
      this._unlocked.set(true);
      this.touch();
    }
    return ok;
  }

  lock(): void {
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    this._unlocked.set(false);
  }

  /** Call on every touch while unlocked: restarts the idle countdown. */
  touch(): void {
    if (!this._unlocked()) {
      return;
    }
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.lock(), ADMIN_IDLE_MINUTES * 60_000);
  }
}
