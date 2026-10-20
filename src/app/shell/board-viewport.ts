import { Component, computed, inject, input } from '@angular/core';
import { buildBoardGeometry } from '../core/board-geometry';
import { gcodeSegments } from '../core/gcode-path';
import { GcodeService } from '../core/gcode.service';
import { GerberService } from '../core/gerber.service';
import { MachineService } from '../core/machine.service';
import { BoardSide, PlacementService } from '../core/placement.service';
import { PegBoardViewport } from '../ui/peg-board-viewport/peg-board-viewport';

export type ViewportMode = 'design' | 'simulate' | 'machine';

/**
 * Connects the shared services to the presentational `PegBoardViewport`.
 * `design` is the only interactive mode (drag, nudge, rotate and flip edit
 * the placement); `simulate` follows the G-code line and `machine` follows the
 * live job and head position.
 */
@Component({
  selector: 'app-board-viewport',
  imports: [PegBoardViewport],
  template: `
    <app-peg-board-viewport
      [geometry]="geometry()"
      [offsetX]="placement.offsetX()"
      [offsetY]="placement.offsetY()"
      [quarterTurns]="placement.quarterTurns()"
      [mirrored]="placement.side() === 'bottom'"
      [path]="path()"
      [doneLine]="doneLine()"
      [tool]="tool()"
      [interactive]="mode() === 'design'"
      [side]="placement.side()"
      (sideChange)="placement.setSide($event)"
      (offsetChange)="placement.setOffset($event.x, $event.y)"
      (rotated)="placement.rotate()"
      (flipped)="flip()"
    />
  `,
  styles: `
    :host {
      display: flex;
      flex: 1;
      min-height: 0;
    }
  `,
})
export class BoardViewport {
  readonly mode = input.required<ViewportMode>();

  protected readonly placement = inject(PlacementService);
  private readonly gerber = inject(GerberService);
  private readonly gcode = inject(GcodeService);
  private readonly machine = inject(MachineService);

  protected readonly geometry = computed(() => {
    const project = this.gerber.project();
    return project ? buildBoardGeometry(project, this.placement.side()) : null;
  });

  protected readonly path = computed(() => gcodeSegments(this.gcode.lines()));

  protected readonly doneLine = computed(() => {
    switch (this.mode()) {
      case 'simulate':
        return this.gcode.currentLine();
      case 'machine':
        return this.machine.job()?.line ?? 0;
      default:
        return 0;
    }
  });

  protected readonly tool = computed(() => {
    switch (this.mode()) {
      case 'simulate':
        return this.gcode.currentPosition();
      case 'machine': {
        const position = this.machine.position();
        return position ? { x: position.x, y: position.y } : null;
      }
      default:
        return null;
    }
  });

  protected flip(): void {
    const next: BoardSide = this.placement.side() === 'top' ? 'bottom' : 'top';
    this.placement.setSide(next);
  }
}
