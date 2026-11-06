import { Component, computed, inject } from '@angular/core';
import { JOG_STEPS, JogAxis, MachineService } from '../../core/machine.service';
import { Button } from '../../ui/button/button';
import { Field, FieldOption, FieldValue } from '../../ui/field/field';
import { Icon } from '../../ui/icon/icon';

interface JogButton {
  readonly axis: JogAxis;
  readonly direction: 1 | -1;
  readonly label: string;
  /** Rotation of the right-pointing arrow, degrees. */
  readonly rotate: number;
  readonly area: string;
}

const BUTTONS: readonly JogButton[] = [
  { axis: 'Y', direction: 1, label: 'Y+', rotate: -90, area: 'yp' },
  { axis: 'X', direction: -1, label: 'X-', rotate: 180, area: 'xm' },
  { axis: 'X', direction: 1, label: 'X+', rotate: 0, area: 'xp' },
  { axis: 'Y', direction: -1, label: 'Y-', rotate: 90, area: 'ym' },
];

/** Jog pad for X and Y, with the step and feed. Buttons are enabled only while the machine is connected and idle. */
@Component({
  selector: 'app-jog-section',
  imports: [Button, Field, Icon],
  template: `
    <div class="pad" role="group" aria-label="Jog axes">
      @for (b of buttons; track b.label) {
        <button
          appButton
          [style.grid-area]="b.area"
          [disabled]="!machine.canMove()"
          [attr.aria-label]="'Jog ' + b.label + ' by ' + machine.jogStep() + ' mm'"
          (click)="machine.jog(b.axis, b.direction)"
        >
          <app-icon name="arrow-right" [size]="16" [style.transform]="'rotate(' + b.rotate + 'deg)'" />
          {{ b.label }}
        </button>
      }
    </div>
    <app-field
      kind="segmented"
      label="Step (mm)"
      [options]="steps"
      [value]="machine.jogStep()"
      (valueChange)="onStep($event)"
    />
    <app-field
      kind="number"
      label="Jog feed"
      unit="mm/min"
      [min]="1"
      [step]="100"
      [value]="machine.jogFeed()"
      (valueChange)="onFeed($event)"
    />
    <div class="home" role="group" aria-label="Homing">
      <button appButton size="sm" [disabled]="!machine.canMove()" (click)="machine.homeAxis('X')">
        <app-icon name="house" [size]="16" />
        Home X
      </button>
      <button appButton size="sm" [disabled]="!machine.canMove()" (click)="machine.homeAxis('Y')">
        <app-icon name="house" [size]="16" />
        Home Y
      </button>
      <button appButton class="all" size="sm" [disabled]="!machine.canMove()" (click)="machine.home()">
        <app-icon name="house" [size]="16" />
        Home all
      </button>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .home {
      display: flex;
      gap: var(--space-2);
    }

    .home .all {
      flex: 1;
    }

    .pad {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      grid-template-areas:
        '. yp .'
        'xm . xp'
        '. ym .';
      gap: var(--space-2);
    }
  `,
})
export class JogSection {
  protected readonly machine = inject(MachineService);
  protected readonly buttons = BUTTONS;
  protected readonly steps: readonly FieldOption[] = JOG_STEPS.map((step) => ({
    value: step,
    label: String(step),
  }));

  protected onStep(value: FieldValue): void {
    if (typeof value === 'number') {
      this.machine.setJogStep(value);
    }
  }

  protected onFeed(value: FieldValue): void {
    if (typeof value === 'number') {
      this.machine.setJogFeed(value);
    }
  }
}
