import { Component, inject } from '@angular/core';
import { ViewportPlaceholder } from '../../shell/viewport-placeholder';
import { WorkspaceLayout } from '../../shell/workspace-layout';
import { GcodeService } from '../../core/gcode.service';
import { GcodeViewer } from '../../ui/gcode-viewer/gcode-viewer';
import { PanelSection } from '../../ui/panel/panel-section';
import { EngravingSection } from './engraving-section';
import { LayerList } from './layer-list';
import { PlacementReadout } from './placement-readout';
import { PlacementSection } from './placement-section';
import { ProjectSection } from './project-section';

/** Design workspace: load a Gerber, place it on the peg board, preview G-code. The 3D viewport is still a placeholder. */
@Component({
  selector: 'app-design-page',
  imports: [
    WorkspaceLayout,
    PanelSection,
    ViewportPlaceholder,
    ProjectSection,
    LayerList,
    PlacementSection,
    EngravingSection,
    PlacementReadout,
    GcodeViewer,
  ],
  template: `
    <app-workspace-layout leftLabel="Project and placement settings" rightLabel="Placement readout and G-code">
      <app-panel-section left heading="Project">
        <app-project-section />
      </app-panel-section>
      <app-panel-section left heading="Layers">
        <app-layer-list />
      </app-panel-section>
      <app-panel-section left heading="Placement">
        <app-placement-section />
      </app-panel-section>
      <app-panel-section left heading="Engraving">
        <app-engraving-section />
      </app-panel-section>

      <app-viewport-placeholder>The 3D viewport will go here.</app-viewport-placeholder>

      <app-panel-section right heading="Placement">
        <app-placement-readout />
      </app-panel-section>
      <app-gcode-viewer
        right
        [lines]="gcode.lines()"
        (exported)="gcode.exportToFile()"
        emptyMessage="No G-code yet. Load a Gerber to preview it."
      />
    </app-workspace-layout>
  `,
  styles: `
    :host {
      display: contents;
    }

    /* The right panel is a flex column: the placement section keeps its natural height, the viewer takes the rest. */
    app-panel-section[right] {
      flex: none;
    }

    app-gcode-viewer {
      flex: 1;
      min-height: 160px;
    }
  `,
})
export class DesignPage {
  protected readonly gcode = inject(GcodeService);
}
