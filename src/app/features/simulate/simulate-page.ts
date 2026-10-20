import { Component, inject } from '@angular/core';
import { GcodeService } from '../../core/gcode.service';
import { WorkspaceRouter } from '../../core/workspace-router';
import { ViewportPlaceholder } from '../../shell/viewport-placeholder';
import { WorkspaceLayout } from '../../shell/workspace-layout';
import { Button } from '../../ui/button/button';
import { GcodeViewer } from '../../ui/gcode-viewer/gcode-viewer';
import { Icon } from '../../ui/icon/icon';
import { PanelSection } from '../../ui/panel/panel-section';
import { CurrentMove } from './current-move';
import { DryRunSection } from './dry-run-section';
import { JobSettings } from './job-settings';
import { SimulationControls } from './simulation-controls';
import { SimulationLayers } from './simulation-layers';

/** Simulate workspace: dry-run replay on the board, the transport bar and the G-code viewer. The 3D viewport is still a placeholder. */
@Component({
  selector: 'app-simulate-page',
  imports: [
    WorkspaceLayout,
    PanelSection,
    ViewportPlaceholder,
    Button,
    Icon,
    DryRunSection,
    SimulationLayers,
    JobSettings,
    SimulationControls,
    CurrentMove,
    GcodeViewer,
  ],
  template: `
    <app-workspace-layout leftLabel="Simulation summary" rightLabel="G-code progress">
      <app-panel-section left heading="Dry run">
        <app-dry-run-section />
      </app-panel-section>
      <app-panel-section left heading="Layers">
        <app-simulation-layers />
      </app-panel-section>
      <app-panel-section left heading="Job settings">
        <app-job-settings />
      </app-panel-section>
      <div left class="nav">
        <button appButton class="block" (click)="workspace.select('design')">Adjust placement</button>
        <button appButton class="block" (click)="workspace.select('machine')">
          Continue to machine
          <app-icon name="arrow-right" />
        </button>
      </div>

      <app-viewport-placeholder>The 3D viewport will go here.</app-viewport-placeholder>
      <app-simulation-controls />

      <app-panel-section right heading="Current move">
        <app-current-move />
      </app-panel-section>
      <app-gcode-viewer
        right
        heading="G-code"
        emptyMessage="No G-code yet. Load a Gerber in Design to generate it."
        [lines]="gcode.lines()"
        [currentLine]="gcode.currentLine()"
        (exported)="gcode.exportToFile()"
      />
    </app-workspace-layout>
  `,
  styles: `
    :host {
      display: contents;
    }

    .nav {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin-top: auto;
    }

    .block {
      width: 100%;
    }
  `,
})
export class SimulatePage {
  protected readonly gcode = inject(GcodeService);
  protected readonly workspace = inject(WorkspaceRouter);
}
