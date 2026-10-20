import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
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

  /** Stays true until a project exists; there is no project state yet. */
  protected readonly exportDisabled = signal(true);

  protected onTabChange(tab: WorkspaceTab): void {
    void this.workspace.select(tab);
  }

  protected onExportRequested(): void {
    // Export arrives with G-code generation.
  }
}
