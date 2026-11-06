import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { MachineService } from '../../core/machine.service';
import { EmptyNote } from '../../shell/empty-note';
import { Button } from '../../ui/button/button';
import { Field, FieldValue } from '../../ui/field/field';

/**
 * Machine console: a scrolling log of what was sent (`> ...`) and what came
 * back, and a command line. The log is a polite live region and scrolls to
 * the newest line; it never takes focus on its own. It is focusable so a
 * keyboard user can scroll it.
 */
@Component({
  selector: 'app-console-log',
  imports: [EmptyNote, Field, Button],
  template: `
    <div #well class="well" role="log" aria-label="Machine console" tabindex="0">
      @for (line of lines(); track $index) {
        <p class="line" [class.sent]="line.startsWith('> ')" [class.status]="line.startsWith('<')">{{ line }}</p>
      } @empty {
        <app-empty-note>No machine output yet.</app-empty-note>
      }
    </div>
    <form class="send" (submit)="onSubmit($event)">
      <app-field
        kind="text"
        label="Command"
        placeholder="$$ or G0 X10"
        [value]="command()"
        [disabled]="!connected()"
        (valueChange)="onCommand($event)"
      />
      <button appButton type="submit" size="sm" [disabled]="!connected() || command().trim() === ''">
        Send
      </button>
    </form>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .well {
      box-sizing: border-box;
      height: 240px;
      padding: 10px var(--space-3);
      background: var(--surface-sunken);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      overflow: auto;
    }

    .line {
      margin: 0;
      font-family: var(--font-mono);
      font-size: 11.5px;
      line-height: 18px;
      color: var(--ink-muted);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .line.status {
      color: var(--ink);
    }

    .line.sent {
      color: var(--accent-strong);
    }

    .send {
      display: flex;
      align-items: flex-end;
      gap: var(--space-2);
    }

    .send app-field {
      flex: 1;
      min-width: 0;
    }
  `,
})
export class ConsoleLog {
  private readonly machine = inject(MachineService);
  private readonly well = viewChild.required<ElementRef<HTMLElement>>('well');

  protected readonly lines = this.machine.consoleLines;
  protected readonly connected = computed(() => this.machine.connection() === 'connected');
  protected readonly command = signal('');

  constructor() {
    effect(() => {
      this.lines();
      const el = this.well().nativeElement;
      // Wait for the new line to render, then follow it.
      queueMicrotask(() => (el.scrollTop = el.scrollHeight));
    });
  }

  protected onCommand(value: FieldValue): void {
    this.command.set(typeof value === 'string' ? value : '');
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    const command = this.command().trim();
    if (command === '' || !this.connected()) {
      return;
    }
    void this.machine.send(command);
    this.command.set('');
  }
}
