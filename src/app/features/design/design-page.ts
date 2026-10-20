import { Component } from '@angular/core';
import { EmptyNote } from '../../shell/empty-note';
import { ViewportPlaceholder } from '../../shell/viewport-placeholder';
import { WorkspaceLayout } from '../../shell/workspace-layout';
import { PanelSection } from '../../ui/panel/panel-section';

/** Design workspace: load a Gerber, place it on the peg board, preview G-code. Placeholder content. */
@Component({
  selector: 'app-design-page',
  imports: [WorkspaceLayout, PanelSection, EmptyNote, ViewportPlaceholder],
  template: `
    <app-workspace-layout leftLabel="Project and placement settings" rightLabel="Placement readout and G-code">
      <app-panel-section left heading="Project">
        <app-empty-note>No Gerber loaded. Open a Gerber to see the board.</app-empty-note>
      </app-panel-section>
      <app-panel-section left heading="Layers">
        <app-empty-note>Layers appear once a Gerber is loaded.</app-empty-note>
      </app-panel-section>
      <app-panel-section left heading="Placement">
        <app-empty-note>Offset, side and mirror are set once a board is loaded.</app-empty-note>
      </app-panel-section>
      <app-panel-section left heading="Engraving">
        <app-empty-note>Set laser power and feed once a board is loaded.</app-empty-note>
      </app-panel-section>

      <app-viewport-placeholder>The 3D viewport will go here.</app-viewport-placeholder>

      <app-panel-section right heading="Placement">
        <app-empty-note>No board placed. The offset appears here once a Gerber is loaded.</app-empty-note>
      </app-panel-section>
      <app-panel-section right heading="G-code">
        <app-empty-note>No G-code yet. Load a Gerber to preview it.</app-empty-note>
      </app-panel-section>
    </app-workspace-layout>
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class DesignPage {}
