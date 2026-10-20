import { Component, computed, inject } from '@angular/core';
import { MachineService } from '../../core/machine.service';
import { Button } from '../../ui/button/button';
import { Field, FieldOption, FieldValue } from '../../ui/field/field';
import { Icon } from '../../ui/icon/icon';
import { StatusChip } from '../../ui/status-chip/status-chip';

/** Content of the Machine page's Connection section: serial port, connection state, connect button. */
@Component({
  selector: 'app-connection-section',
  imports: [Field, StatusChip, Button, Icon],
  template: `
    <app-field
      kind="select"
      label="Serial port"
      [options]="options()"
      [value]="machine.port()"
      [disabled]="selectDisabled()"
      [help]="help()"
      (valueChange)="onPort($event)"
    />
    <div class="row">
      <app-status-chip
        [status]="machine.connection()"
        [detail]="machine.connection() === 'connected' ? machine.port() : undefined"
      />
      @if (connected()) {
        <button appButton size="sm" (click)="machine.disconnect()">
          <app-icon name="plugs" [size]="16" />
          Disconnect
        </button>
      } @else {
        <button appButton size="sm" [disabled]="!machine.port()" (click)="machine.connect()">
          <app-icon name="plugs-connected" [size]="16" />
          Connect
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }
  `,
})
export class ConnectionSection {
  protected readonly machine = inject(MachineService);

  protected readonly connected = computed(() => this.machine.connection() === 'connected');

  protected readonly options = computed<FieldOption[]>(() => {
    const ports = this.machine.ports();
    if (ports.length === 0) {
      return [];
    }
    const choices = ports.map((port) => ({ value: port, label: port }));
    return this.machine.port() === '' ? [{ value: '', label: 'Choose a port' }, ...choices] : choices;
  });

  /** The port cannot change while the machine is connected, and there is nothing to pick without ports. */
  protected readonly selectDisabled = computed(
    () => this.machine.ports().length === 0 || this.connected(),
  );

  protected readonly help = computed(() =>
    this.machine.ports().length === 0
      ? 'No serial ports found. Plug in the machine and reopen this screen.'
      : undefined,
  );

  protected onPort(value: FieldValue): void {
    if (typeof value === 'string') {
      this.machine.selectPort(value);
    }
  }
}
