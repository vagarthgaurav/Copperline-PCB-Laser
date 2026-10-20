import { Component, computed, inject, signal } from '@angular/core';
import { EngravingService } from '../../core/engraving.service';
import { GerberService } from '../../core/gerber.service';
import { EmptyNote } from '../../shell/empty-note';
import { Field, FieldValue } from '../../ui/field/field';

export const FEED_RATE_ERROR = 'Enter a whole number of 1 mm/min or more';

/** Content of the Design page's Engraving section: laser power and feed rate. */
@Component({
  selector: 'app-engraving-section',
  imports: [Field, EmptyNote],
  template: `
    @if (loaded()) {
      <app-field
        kind="slider"
        label="Laser power"
        unit="%"
        min="0"
        max="100"
        step="1"
        [value]="engraving.power()"
        (valueChange)="onPower($event)"
      />
      <app-field
        kind="number"
        label="Feed rate"
        unit="mm/min"
        min="1"
        step="1"
        [value]="engraving.feedRate()"
        [error]="feedInvalid() ? feedError : undefined"
        (valueChange)="onFeedRate($event)"
      />
    } @else {
      <app-empty-note>Set laser power and feed once a board is loaded.</app-empty-note>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
  `,
})
export class EngravingSection {
  protected readonly engraving = inject(EngravingService);
  private readonly gerber = inject(GerberService);

  protected readonly feedError = FEED_RATE_ERROR;
  protected readonly loaded = computed(() => this.gerber.project() !== null);
  protected readonly feedInvalid = signal(false);

  protected onPower(value: FieldValue): void {
    if (typeof value === 'number') {
      this.engraving.setPower(value);
    }
  }

  protected onFeedRate(value: FieldValue): void {
    const valid = typeof value === 'number' && Number.isInteger(value) && value >= 1;
    this.feedInvalid.set(!valid);
    if (valid) {
      this.engraving.setFeedRate(value);
    }
  }
}
