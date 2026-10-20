import {
  DestroyRef,
  ElementRef,
  Component,
  afterNextRender,
  computed,
  inject,
  input,
} from '@angular/core';
import { PanelWidthService } from '../core/panel-width.service';
import { Panel } from '../ui/panel/panel';
import { PanelResizer } from '../ui/panel-resizer/panel-resizer';

/** Width of a resize handle column; equals `--space-4`, the gap it replaces. */
const HANDLE_WIDTH = 16;

let nextId = 0;

/**
 * Body of every workspace: a left panel, the centre viewport and a right
 * panel, with a drag handle in the 16px gap beside each panel. Project panel
 * sections with the `left` and `right` attributes
 * (`<app-panel-section left heading="Project">`); anything else goes to the
 * centre `<main>`. Panels scroll inside themselves, never the page. Panel
 * widths come from `PanelWidthService`, so all workspaces share them.
 */
@Component({
  selector: 'app-workspace-layout',
  imports: [Panel, PanelResizer],
  template: `
    <app-panel [id]="leftId" [label]="leftLabel()"><ng-content select="[left]" /></app-panel>
    <app-panel-resizer
      side="left"
      label="Resize left panel"
      [controls]="leftId"
      [value]="widths.left()"
      [min]="widths.min"
      [max]="widths.leftMax()"
      [defaultValue]="widths.defaultWidth"
      (resized)="widths.setLeft($event)"
    />
    <main><ng-content /></main>
    <app-panel-resizer
      side="right"
      label="Resize right panel"
      [controls]="rightId"
      [value]="widths.right()"
      [min]="widths.min"
      [max]="widths.rightMax()"
      [defaultValue]="widths.defaultWidth"
      (resized)="widths.setRight($event)"
    />
    <app-panel [id]="rightId" [label]="rightLabel()"><ng-content select="[right]" /></app-panel>
  `,
  styleUrl: './workspace-layout.scss',
  host: {
    '[style.grid-template-columns]': 'columns()',
  },
})
export class WorkspaceLayout {
  protected readonly widths = inject(PanelWidthService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  /** Accessible name of the left `complementary` landmark. */
  readonly leftLabel = input.required<string>();
  /** Accessible name of the right `complementary` landmark. */
  readonly rightLabel = input.required<string>();

  protected readonly leftId = `workspace-left-panel-${nextId}`;
  protected readonly rightId = `workspace-right-panel-${nextId++}`;

  protected readonly columns = computed(
    () =>
      `${this.widths.left()}px ${HANDLE_WIDTH}px minmax(0, 1fr) ${HANDLE_WIDTH}px ${this.widths.right()}px`,
  );

  constructor() {
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      // contentRect excludes the layout's padding; the handles take their columns too.
      const observer = new ResizeObserver((entries) => {
        const width = entries[entries.length - 1].contentRect.width;
        this.widths.setAvailable(width - 2 * HANDLE_WIDTH);
      });
      observer.observe(this.host.nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
