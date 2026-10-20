import { Component, computed, input } from '@angular/core';
import { Icon } from '../icon/icon';
import { IconName } from '../icon/icons';

export type MachineStatus = 'connected' | 'disconnected' | 'engraving' | 'paused' | 'fault';

const STATUS_META: Record<MachineStatus, { icon: IconName; label: string }> = {
  connected: { icon: 'check', label: 'Connected' },
  disconnected: { icon: 'plugs', label: 'Disconnected' },
  engraving: { icon: 'crosshair', label: 'Engraving' },
  paused: { icon: 'pause', label: 'Paused' },
  fault: { icon: 'warning', label: 'Fault' },
};

/**
 * Pill showing the machine or job state as icon plus word. The host is a
 * polite live region (`role="status"`); update its inputs rather than
 * re-creating the node so changes are announced.
 */
@Component({
  selector: 'app-status-chip',
  imports: [Icon],
  template: `
    <app-icon [name]="icon()" [size]="16" />
    {{ text() }}
    @if (detail(); as detail) {
      <span class="detail">{{ detail }}</span>
    }
  `,
  styleUrl: './status-chip.scss',
  host: {
    role: 'status',
    '[attr.data-status]': 'status()',
  },
})
export class StatusChip {
  readonly status = input.required<MachineStatus>();
  /** Overrides the default word for the status. */
  readonly label = input<string>();
  /** Mono text after the word, such as a port name or `42%`. */
  readonly detail = input<string>();

  protected readonly icon = computed(() => STATUS_META[this.status()].icon);
  protected readonly text = computed(() => this.label() ?? STATUS_META[this.status()].label);
}
