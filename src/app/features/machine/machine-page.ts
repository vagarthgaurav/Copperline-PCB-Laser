import { Component, computed, inject } from '@angular/core';
import { GcodeService } from '../../core/gcode.service';
import { BoardViewport } from '../../shell/board-viewport';
import { WorkspaceLayout } from '../../shell/workspace-layout';
import { GcodeViewer } from '../../ui/gcode-viewer/gcode-viewer';
import { PanelSection } from '../../ui/panel/panel-section';
import { Tile } from '../../ui/tile/tile';
import { ConnectionSection } from './connection-section';
import { ConsoleLog } from './console-log';
import { JobBar } from './job-bar';
import { JobSection } from './job-section';
import { formatCoordinate } from './machine-format';
import { PositionSection } from './position-section';

/** Machine workspace: serial connection, live engraving and job controls. The centre is the peg-board viewport following the live job. */
@Component({
  selector: 'app-machine-page',
  imports: [
    WorkspaceLayout,
    PanelSection,
    BoardViewport,
    GcodeViewer,
    Tile,
    ConnectionSection,
    PositionSection,
    JobSection,
    ConsoleLog,
    JobBar,
  ],
  template: `
    <app-workspace-layout leftLabel="Machine status" rightLabel="Live G-code">
      <app-panel-section left heading="Connection">
        <app-connection-section />
      </app-panel-section>
      <app-panel-section left heading="Position">
        <app-position-section />
      </app-panel-section>
      <app-panel-section left heading="Job">
        <app-job-section />
      </app-panel-section>
      <app-panel-section left heading="Console">
        <app-console-log />
      </app-panel-section>

      <app-board-viewport mode="machine" />
      <app-job-bar />

      <app-panel-section right heading="Current move">
        <div class="tiles" role="group" aria-label="Current move in millimetres">
          <app-tile label="X" unit="mm" [value]="x()" />
          <app-tile label="Y" unit="mm" [value]="y()" />
        </div>
      </app-panel-section>
      <app-gcode-viewer
        right
        heading="G-code"
        emptyMessage="Nothing streaming. Start a job to see live G-code."
        [lines]="gcode.lines()"
        [currentLine]="gcode.currentLine()"
        [showExport]="false"
      />
    </app-workspace-layout>
  `,
  styles: `
    :host {
      display: contents;
    }

    /* The right panel is a flex column: the tiles keep their natural height, the viewer takes the rest. */
    app-panel-section[right] {
      flex: none;
    }

    .tiles {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-2);
    }

    app-gcode-viewer {
      flex: 1;
      min-height: 160px;
    }
  `,
})
export class MachinePage {
  protected readonly gcode = inject(GcodeService);

  private readonly move = computed(() => this.gcode.currentPosition());
  protected readonly x = computed(() => formatCoordinate(this.move()?.x));
  protected readonly y = computed(() => formatCoordinate(this.move()?.y));
}
