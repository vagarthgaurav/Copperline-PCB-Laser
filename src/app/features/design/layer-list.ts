import { Component, computed, inject, linkedSignal } from '@angular/core';
import { GerberService } from '../../core/gerber.service';
import { LayerKind } from '../../core/gerber.types';
import { EmptyNote } from '../../shell/empty-note';
import { Banner } from '../../ui/banner/banner';

type SwatchKind = 'copper' | 'outline' | 'drill';

function swatchFor(kind: LayerKind): SwatchKind {
  switch (kind) {
    case 'topCopper':
    case 'bottomCopper':
      return 'copper';
    case 'outline':
      return 'outline';
    case 'drill':
      return 'drill';
  }
}

/** Content of the Design page's Layers section: one button per layer, plus the selected layer's warnings. */
@Component({
  selector: 'app-layer-list',
  imports: [Banner, EmptyNote],
  template: `
    @if (layers().length > 0) {
      <ul class="layers" aria-label="Layers">
        @for (layer of layers(); track layer.id) {
          <li>
            <button
              type="button"
              class="layer"
              [attr.aria-current]="layer.id === selectedId() ? 'true' : null"
              (click)="gerber.selectLayer(layer.id)"
            >
              <span class="swatch" [attr.data-kind]="swatch(layer.kind)" aria-hidden="true"></span>
              <span class="name">{{ layer.label }}</span>
              <span class="file" [attr.title]="layer.fileName">{{ layer.fileName }}</span>
            </button>
          </li>
        }
      </ul>
      @if (!warningDismissed() && warningMessage(); as message) {
        <app-banner
          severity="warning"
          [message]="message"
          dismissible
          (dismissed)="warningDismissed.set(true)"
        />
      }
    } @else {
      <app-empty-note>Layers appear once a Gerber is loaded.</app-empty-note>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .layers {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .layer {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      box-sizing: border-box;
      width: 100%;
      min-height: 32px;
      padding: 0 var(--space-2);
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--radius-md);
      color: var(--ink);
      font: 400 14px/20px var(--font-sans);
      text-align: left;
      cursor: pointer;
    }
    .layer:hover {
      background: var(--surface-sunken);
    }
    .layer:focus-visible {
      outline: 2px solid var(--ring);
      outline-offset: 2px;
    }
    .layer[aria-current='true'] {
      background: var(--accent-soft);
      border-color: var(--accent);
      font-weight: 600;
    }

    .swatch {
      flex: none;
      width: 12px;
      height: 12px;
      border: 1px solid var(--border-strong);
      border-radius: 3px;
    }
    .swatch[data-kind='copper'] {
      background: var(--scene-copper);
    }
    .swatch[data-kind='outline'] {
      background: var(--surface-300);
    }
    .swatch[data-kind='drill'] {
      background: var(--scene-board);
    }

    .name {
      flex: none;
    }

    .file {
      min-width: 0;
      margin-left: auto;
      overflow: hidden;
      color: var(--ink-muted);
      font-family: var(--font-mono);
      font-size: 11.5px;
      font-weight: 400;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class LayerList {
  protected readonly gerber = inject(GerberService);

  protected readonly layers = computed(() => this.gerber.project()?.layers ?? []);
  protected readonly selectedId = this.gerber.selectedLayerId;

  /** Closing the warning banner lasts until another layer is selected or a new project is loaded. */
  protected readonly warningDismissed = linkedSignal({
    source: this.gerber.selectedLayer,
    computation: () => false,
  });

  protected readonly warningMessage = computed(() => {
    const layer = this.gerber.selectedLayer();
    if (!layer || layer.warnings.length === 0) {
      return null;
    }
    return `${layer.label} (${layer.fileName}): ${layer.warnings.join(' ')}`;
  });

  protected swatch(kind: LayerKind): SwatchKind {
    return swatchFor(kind);
  }
}
