import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { GerberService } from '../../core/gerber.service';
import { PlacementService } from '../../core/placement.service';
import { EmptyNote } from '../../shell/empty-note';
import { Field, FieldOption, FieldValue } from '../../ui/field/field';

export const OFFSET_ERROR = 'Enter a number in mm';
export const FREE_PLACEMENT_NOTE =
  'Free placement: the design has no peg holes (include the NPTH drill file)';

/** Offsets are fine to 0.1 mm while free; on the peg grid the arrow keys step one pitch. */
const FREE_STEP = 0.1;

/** Content of the Design page's left Placement section: offsets, side and mirror. */
@Component({
  selector: 'app-placement-section',
  imports: [Field, EmptyNote],
  template: `
    @if (loaded()) {
      <div class="row2">
        <app-field
          kind="number"
          #xField
          label="Offset X"
          unit="mm"
          [step]="step()"
          [value]="placement.offsetX()"
          [error]="xInvalid() ? offsetError : undefined"
          (valueChange)="onOffsetX($event)"
          (change)="commit()"
          (keyup.arrowup)="commit()"
          (keyup.arrowdown)="commit()"
        />
        <app-field
          kind="number"
          #yField
          label="Offset Y"
          unit="mm"
          [step]="step()"
          [value]="placement.offsetY()"
          [error]="yInvalid() ? offsetError : undefined"
          (valueChange)="onOffsetY($event)"
          (change)="commit()"
          (keyup.arrowup)="commit()"
          (keyup.arrowdown)="commit()"
        />
      </div>
      <p class="status small">{{ status() }}</p>
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

    .status {
      margin: 0;
      color: var(--ink-muted);
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
  protected readonly step = computed(() => this.placement.snapPitch() ?? FREE_STEP);
  protected readonly status = computed(() => {
    const pitch = this.placement.snapPitch();
    return pitch === null ? FREE_PLACEMENT_NOTE : `Snapped to the ${pitch} mm peg grid`;
  });
  private readonly xField = viewChild<Field>('xField');
  private readonly yField = viewChild<Field>('yField');
  /** Typed values waiting for Enter or leaving the field; offsets are clamped to the floor and snapped on commit. */
  private pendingX: number | null = null;
  private pendingY: number | null = null;
  protected readonly xInvalid = signal(false);
  protected readonly yInvalid = signal(false);

  protected onOffsetX(value: FieldValue): void {
    const valid = typeof value === 'number';
    this.xInvalid.set(!valid);
    if (!valid) {
      this.pendingX = null;
    } else {
      // Clamping or snapping on every keystroke would rewrite the text under the cursor.
      this.pendingX = value;
    }
  }

  protected onOffsetY(value: FieldValue): void {
    const valid = typeof value === 'number';
    this.yInvalid.set(!valid);
    if (!valid) {
      this.pendingY = null;
    } else {
      this.pendingY = value;
    }
  }

  /** Applies typed offsets and shows where the board really went (clamped to the floor, snapped), even if that equals the old value. */
  protected commit(): void {
    const { pendingX, pendingY } = this;
    if (pendingX === null && pendingY === null) {
      return;
    }
    this.pendingX = null;
    this.pendingY = null;
    this.placement.setOffset(
      pendingX ?? this.placement.offsetX(),
      pendingY ?? this.placement.offsetY(),
    );
    if (pendingX !== null) {
      this.xField()?.value.set(this.placement.offsetX());
    }
    if (pendingY !== null) {
      this.yField()?.value.set(this.placement.offsetY());
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
