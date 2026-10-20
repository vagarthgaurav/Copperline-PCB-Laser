import { Component, input } from '@angular/core';
import { Panel } from '../ui/panel/panel';

/**
 * Body of every workspace: a left panel, the centre viewport and a right
 * panel. Project panel sections with the `left` and `right` attributes
 * (`<app-panel-section left heading="Project">`); anything else goes to the
 * centre `<main>`. Panels scroll inside themselves, never the page.
 */
@Component({
  selector: 'app-workspace-layout',
  imports: [Panel],
  template: `
    <app-panel [label]="leftLabel()"><ng-content select="[left]" /></app-panel>
    <main><ng-content /></main>
    <app-panel [label]="rightLabel()"><ng-content select="[right]" /></app-panel>
  `,
  styleUrl: './workspace-layout.scss',
})
export class WorkspaceLayout {
  /** Accessible name of the left `complementary` landmark. */
  readonly leftLabel = input.required<string>();
  /** Accessible name of the right `complementary` landmark. */
  readonly rightLabel = input.required<string>();
}
