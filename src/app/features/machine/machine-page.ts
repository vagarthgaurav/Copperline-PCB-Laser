import { Component } from '@angular/core';
import { EmptyNote } from '../../shell/empty-note';
import { ViewportPlaceholder } from '../../shell/viewport-placeholder';
import { WorkspaceLayout } from '../../shell/workspace-layout';
import { PanelSection } from '../../ui/panel/panel-section';

/** Machine workspace: serial connection, live engraving and job controls. Placeholder content. */
@Component({
  selector: 'app-machine-page',
  imports: [WorkspaceLayout, PanelSection, EmptyNote, ViewportPlaceholder],
  template: `
    <app-workspace-layout leftLabel="Machine status" rightLabel="Live G-code">
      <app-panel-section left heading="Connection">
        <app-empty-note>Not connected. Choose a serial port to connect.</app-empty-note>
      </app-panel-section>
      <app-panel-section left heading="Position">
        <app-empty-note>The laser position is unknown until the machine is connected.</app-empty-note>
      </app-panel-section>
      <app-panel-section left heading="Job">
        <app-empty-note>No job running. Load a Gerber in Design to prepare one.</app-empty-note>
      </app-panel-section>
      <app-panel-section left heading="Console">
        <app-empty-note>No machine output yet.</app-empty-note>
      </app-panel-section>

      <app-viewport-placeholder>The 3D viewport will go here.</app-viewport-placeholder>

      <app-panel-section right heading="Current move">
        <app-empty-note>No move yet. Start a job to follow the laser.</app-empty-note>
      </app-panel-section>
      <app-panel-section right heading="G-code">
        <app-empty-note>Nothing streaming. Start a job to see live G-code.</app-empty-note>
      </app-panel-section>
    </app-workspace-layout>
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class MachinePage {}
