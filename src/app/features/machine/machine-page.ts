import { Component, computed, inject, signal } from '@angular/core';
import { GcodeService } from '../../core/gcode.service';
import { BoardViewport } from '../../shell/board-viewport';
import { WorkspaceLayout } from '../../shell/workspace-layout';
import { GcodeViewer } from '../../ui/gcode-viewer/gcode-viewer';
import { PanelSection } from '../../ui/panel/panel-section';
import { Tile } from '../../ui/tile/tile';
import { ConnectionSection } from './connection-section';
import { ConsoleLog } from './console-log';
import { JogSection } from './jog-section';
import { JobBar } from './job-bar';
import { JobSection } from './job-section';
import { formatCoordinate } from './machine-format';
import { PositionSection } from './position-section';
import { SettingsSection } from './settings-section';
import { Tabs, TabItem } from '../../ui/tabs/tabs';

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
    JogSection,
    ConsoleLog,
    JobBar,
    SettingsSection,
    Tabs,
  ],
  template: `
    <app-workspace-layout leftLabel="Machine status" rightLabel="Live G-code">
      <div left class="left">
        <app-tabs
          label="Machine panel"
          idPrefix="machine-left"
          [tabs]="tabs"
          [(selected)]="tab"
        />
        @if (tab() === 'control') {
          <div class="tab-panel" role="tabpanel" id="machine-left-panel-control" aria-labelledby="machine-left-tab-control">
            <app-panel-section heading="Connection">
              <app-connection-section />
            </app-panel-section>
            <app-panel-section heading="Position">
              <app-position-section />
            </app-panel-section>
            <app-panel-section heading="Jog">
              <app-jog-section />
            </app-panel-section>
            <app-panel-section heading="Job">
              <app-job-section />
            </app-panel-section>
            <app-panel-section heading="Console">
              <app-console-log />
            </app-panel-section>
          </div>
        } @else {
          <div class="tab-panel" role="tabpanel" id="machine-left-panel-settings" aria-labelledby="machine-left-tab-settings">
            <app-panel-section heading="Settings">
              <app-settings-section />
            </app-panel-section>
          </div>
        }
      </div>

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

    /* The left panel is a flex column that scrolls inside itself; the tab strip stays put. */
    .left {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      min-height: 0;
      overflow: hidden;
    }

    .tab-panel {
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
      min-height: 0;
      overflow-y: auto;
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
  protected readonly tabs: readonly TabItem[] = [
    { id: 'control', label: 'Control' },
    { id: 'settings', label: 'Settings' },
  ];
  protected readonly tab = signal('control');

  private readonly move = computed(() => this.gcode.currentPosition());
  protected readonly x = computed(() => formatCoordinate(this.move()?.x));
  protected readonly y = computed(() => formatCoordinate(this.move()?.y));
}
