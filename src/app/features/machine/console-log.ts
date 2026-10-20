import { Component, computed, inject } from '@angular/core';
import { MachineService } from '../../core/machine.service';
import { EmptyNote } from '../../shell/empty-note';

/** Number of machine output lines kept on screen. */
export const CONSOLE_LINES = 4;

/**
 * Last lines of machine output in a polite live region. It never takes
 * focus, so new lines are announced without moving the user.
 */
@Component({
  selector: 'app-console-log',
  imports: [EmptyNote],
  template: `
    <div class="well" role="log" aria-label="Machine console">
      @for (line of lines(); track $index) {
        <p class="line" [class.status]="line.startsWith('<')">{{ line }}</p>
      } @empty {
        <app-empty-note>No machine output yet.</app-empty-note>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .well {
      box-sizing: border-box;
      padding: 10px var(--space-3);
      background: var(--surface-sunken);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      overflow: hidden;
    }

    .line {
      margin: 0;
      font-family: var(--font-mono);
      font-size: 11.5px;
      line-height: 18px;
      color: var(--ink-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .line.status {
      color: var(--ink);
    }
  `,
})
export class ConsoleLog {
  private readonly machine = inject(MachineService);

  protected readonly lines = computed(() => this.machine.consoleLines().slice(-CONSOLE_LINES));
}
