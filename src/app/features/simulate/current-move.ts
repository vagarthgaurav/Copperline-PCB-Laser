import { Component, computed, inject } from '@angular/core';
import { GcodeService } from '../../core/gcode.service';
import { Tile } from '../../ui/tile/tile';

/** Two decimals, integer part padded to three digits: 60.4 becomes "060.40". */
export function formatCoordinate(value: number): string {
  const text = Math.abs(value).toFixed(2).padStart(6, '0');
  return value < 0 && Number(text) !== 0 ? `-${text}` : text;
}

/** Content of the Current move section: the tool's X and Y at the current G-code line. */
@Component({
  selector: 'app-current-move',
  imports: [Tile],
  template: `
    <app-tile label="X" [value]="x()" [unit]="unit()" />
    <app-tile label="Y" [value]="y()" [unit]="unit()" />
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-2);
    }
  `,
})
export class CurrentMove {
  private readonly gcode = inject(GcodeService);

  protected readonly x = computed(() => {
    const position = this.gcode.currentPosition();
    return position ? formatCoordinate(position.x) : '—';
  });
  protected readonly y = computed(() => {
    const position = this.gcode.currentPosition();
    return position ? formatCoordinate(position.y) : '—';
  });
  protected readonly unit = computed(() => (this.gcode.currentPosition() ? 'mm' : undefined));
}
