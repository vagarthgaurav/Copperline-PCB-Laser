import { Component, computed, inject, signal } from '@angular/core';
import { GerberService } from '../../core/gerber.service';
import { PlacementService } from '../../core/placement.service';
import { EmptyNote } from '../../shell/empty-note';
import { Field, FieldOption, FieldValue } from '../../ui/field/field';

export const OFFSET_ERROR = 'Enter a number in mm';

/** Content of the Design page's left Placement section: offsets, side and mirror. */
@Component({
  selector: 'app-placement-section',
  imports: [Field, EmptyNote],
  template: `
    @if (loaded()) {
      <div class="row2">
        <app-field
          kind="number"
          label="Offset X"
          unit="mm"
          step="0.1"
          [value]="placement.offsetX()"
          [error]="xInvalid() ? offsetError : undefined"
          (valueChange)="onOffsetX($event)"
        />
        <app-field
          kind="number"
          label="Offset Y"
          unit="mm"
          step="0.1"
          [value]="placement.offsetY()"
          [error]="yInvalid() ? offsetError : undefined"
          (valueChange)="onOffsetY($event)"
        />
      </div>
      <app-field
        kind="segmented"
        label="Side"
        [options]="sides"
        [value]="placement.side()"
        (valueChange)="onSide($event)"
      />
      <app-field
        kind="switch"
        label="Mirror for bottom side"
        [value]="placement.mirror()"
        (valueChange)="onMirror($event)"
      />
    } @else {
      <app-empty-note>Offset, side and mirror are set once a board is loaded.</app-empty-note>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .row2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-2);
    }
  `,
})
export class PlacementSection {
  protected readonly placement = inject(PlacementService);
  private readonly gerber = inject(GerberService);

  protected readonly offsetError = OFFSET_ERROR;
  protected readonly sides: readonly FieldOption[] = [
    { value: 'top', label: 'Top' },
    { value: 'bottom', label: 'Bottom' },
  ];

  protected readonly loaded = computed(() => this.gerber.project() !== null);
  protected readonly xInvalid = signal(false);
  protected readonly yInvalid = signal(false);

  protected onOffsetX(value: FieldValue): void {
    const valid = typeof value === 'number';
    this.xInvalid.set(!valid);
    if (valid) {
      this.placement.setOffset(value, this.placement.offsetY());
    }
  }

  protected onOffsetY(value: FieldValue): void {
    const valid = typeof value === 'number';
    this.yInvalid.set(!valid);
    if (valid) {
      this.placement.setOffset(this.placement.offsetX(), value);
    }
  }

  protected onSide(value: FieldValue): void {
    if (value === 'top' || value === 'bottom') {
      this.placement.setSide(value);
    }
  }

  protected onMirror(value: FieldValue): void {
    if (typeof value === 'boolean') {
      this.placement.setMirror(value);
    }
  }
}
