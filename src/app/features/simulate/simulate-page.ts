import { Component } from '@angular/core';
import { EmptyNote } from '../../shell/empty-note';
import { ViewportPlaceholder } from '../../shell/viewport-placeholder';
import { WorkspaceLayout } from '../../shell/workspace-layout';
import { PanelSection } from '../../ui/panel/panel-section';

/** Simulate workspace: dry-run replay on the board and in the G-code viewer. Placeholder content. */
@Component({
  selector: 'app-simulate-page',
  imports: [WorkspaceLayout, PanelSection, EmptyNote, ViewportPlaceholder],
  template: `
    <app-workspace-layout leftLabel="Simulation summary" rightLabel="G-code progress">
      <app-panel-section left heading="Dry run">
        <app-empty-note>Nothing to simulate yet. Load a Gerber in Design first.</app-empty-note>
      </app-panel-section>
      <app-panel-section left heading="Layers">
        <app-empty-note>Layer progress appears while a simulation runs.</app-empty-note>
      </app-panel-section>
      <app-panel-section left heading="Job settings">
        <app-empty-note>Job settings appear once a board is loaded.</app-empty-note>
      </app-panel-section>

      <app-viewport-placeholder>The 3D viewport will go here.</app-viewport-placeholder>

      <app-panel-section right heading="Current move">
        <app-empty-note>No move yet. Start a simulation to follow the laser.</app-empty-note>
      </app-panel-section>
      <app-panel-section right heading="G-code">
        <app-empty-note>No G-code yet. Load a Gerber in Design to generate it.</app-empty-note>
      </app-panel-section>
    </app-workspace-layout>
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class SimulatePage {}
