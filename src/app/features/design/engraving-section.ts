import { Component, computed, inject, signal } from '@angular/core';
import {
  EngravingService,
  MAX_ISOLATION_PASSES,
  MAX_PASS_OVERLAP,
  MAX_SPOT_DIAMETER,
  MIN_ISOLATION_PASSES,
  MIN_SPOT_DIAMETER,
} from '../../core/engraving.service';
import { GcodeService } from '../../core/gcode.service';
import { GerberService } from '../../core/gerber.service';
import { EmptyNote } from '../../shell/empty-note';
import { Button } from '../../ui/button/button';
import { Field, FieldValue } from '../../ui/field/field';

export const FEED_RATE_ERROR = 'Enter a whole number of 1 mm/min or more';
export const SPOT_SIZE_ERROR = 'Enter a size from 0.01 to 1 mm';
export const PASSES_ERROR = 'Enter a whole number from 1 to 20';
export const OVERLAP_ERROR = 'Enter a percentage from 0 to 90';

/** Content of the Design page's Engraving section: laser power, feed rate, spot size and isolation passes. */
@Component({
  selector: 'app-engraving-section',
  imports: [Button, Field, EmptyNote],
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
      <app-field
        kind="number"
        label="Spot size"
        unit="mm"
        min="0.01"
        max="1"
        step="0.01"
        [value]="engraving.spotDiameter()"
        [error]="spotInvalid() ? spotError : undefined"
        (valueChange)="onSpot($event)"
      />
      <app-field
        kind="number"
        label="Isolation passes"
        min="1"
        max="20"
        step="1"
        [value]="engraving.isolationPasses()"
        [error]="passesInvalid() ? passesError : undefined"
        (valueChange)="onPasses($event)"
      />
      <app-field
        kind="number"
        label="Pass overlap"
        unit="%"
        min="0"
        max="90"
        step="5"
        [value]="overlapPercent()"
        [error]="overlapInvalid() ? overlapError : undefined"
        (valueChange)="onOverlap($event)"
      />
      <button
        appButton
        variant="primary"
        class="generate"
        [disabled]="gcode.generating() || anyInvalid()"
        [attr.aria-busy]="gcode.generating()"
        (click)="gcode.generate()"
      >
        {{ gcode.generating() ? 'Generating…' : 'Generate G-code' }}
      </button>
      @if (gcode.stale()) {
        <p class="stale" role="status">Settings changed since the last G-code. Generate again.</p>
      }
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

    .generate {
      width: 100%;
    }

    .stale {
      margin: 0;
      color: var(--ink-muted);
      font: 14px/20px var(--font-sans);
    }
  `,
})
export class EngravingSection {
  protected readonly engraving = inject(EngravingService);
  private readonly gerber = inject(GerberService);
  protected readonly gcode = inject(GcodeService);

  protected readonly feedError = FEED_RATE_ERROR;
  protected readonly loaded = computed(() => this.gerber.project() !== null);
  protected readonly feedInvalid = signal(false);

  protected readonly spotError = SPOT_SIZE_ERROR;
  protected readonly spotInvalid = signal(false);
  protected readonly passesError = PASSES_ERROR;
  protected readonly passesInvalid = signal(false);
  protected readonly overlapError = OVERLAP_ERROR;
  protected readonly overlapInvalid = signal(false);

  protected readonly anyInvalid = computed(
    () => this.feedInvalid() || this.spotInvalid() || this.passesInvalid() || this.overlapInvalid(),
  );

  /** The service stores a fraction; the field shows a percentage (rounded to avoid 30.000000000000004). */
  protected readonly overlapPercent = computed(
    () => Math.round(this.engraving.passOverlap() * 1000) / 10,
  );

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

  protected onSpot(value: FieldValue): void {
    const valid = typeof value === 'number' && value >= MIN_SPOT_DIAMETER && value <= MAX_SPOT_DIAMETER;
    this.spotInvalid.set(!valid);
    if (valid) {
      this.engraving.setSpotDiameter(value);
    }
  }

  protected onPasses(value: FieldValue): void {
    const valid =
      typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= MIN_ISOLATION_PASSES &&
      value <= MAX_ISOLATION_PASSES;
    this.passesInvalid.set(!valid);
    if (valid) {
      this.engraving.setIsolationPasses(value);
    }
  }

  protected onOverlap(value: FieldValue): void {
    const valid = typeof value === 'number' && value >= 0 && value <= MAX_PASS_OVERLAP * 100;
    this.overlapInvalid.set(!valid);
    if (valid) {
      this.engraving.setPassOverlap(value / 100);
    }
  }
}
