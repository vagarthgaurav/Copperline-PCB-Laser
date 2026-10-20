import { Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { GcodeService } from './core/gcode.service';
import { MachineService } from './core/machine.service';
import { WorkspaceRouter } from './core/workspace-router';
import { TitleBar, WorkspaceTab } from './title-bar/title-bar';

/** Application shell: the custom title bar above the routed workspace. */
@Component({
  imports: [RouterOutlet, TitleBar],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly workspace = inject(WorkspaceRouter);

  private readonly gcode = inject(GcodeService);
  protected readonly machine = inject(MachineService);

  /** Export needs generated G-code. */
  protected readonly exportDisabled = computed(() => this.gcode.lineCount() === 0);

  protected onTabChange(tab: WorkspaceTab): void {
    void this.workspace.select(tab);
  }

  protected onExportRequested(): void {
    this.gcode.exportToFile();
  }
}
