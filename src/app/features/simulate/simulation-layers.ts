import { Component, computed, inject } from '@angular/core';
import { GerberService } from '../../core/gerber.service';
import { LayerKind } from '../../core/gerber.types';
import { EmptyNote } from '../../shell/empty-note';

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

/**
 * Content of the Layers section: one row per layer with a status word. There
 * is no per-layer timeline yet, so every layer reads "Not run".
 */
@Component({
  selector: 'app-simulation-layers',
  imports: [EmptyNote],
  template: `
    @if (layers().length > 0) {
      <ul aria-label="Layer progress">
        @for (layer of layers(); track layer.id) {
          <li>
            <span class="swatch" [attr.data-kind]="layer.swatch" aria-hidden="true"></span>
            <span class="name">{{ layer.label }}</span>
            <span class="status">Not run</span>
          </li>
        }
      </ul>
    } @else {
      <app-empty-note>Layer progress appears while a simulation runs.</app-empty-note>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    ul {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-height: 32px;
      padding: 0 var(--space-2);
      color: var(--ink);
      font: 400 14px/20px var(--font-sans);
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

    .status {
      margin-left: auto;
      color: var(--ink-muted);
      font-family: var(--font-mono);
      font-size: 11.5px;
    }
  `,
})
export class SimulationLayers {
  private readonly gerber = inject(GerberService);

  protected readonly layers = computed(() =>
    (this.gerber.project()?.layers ?? []).map((layer) => ({
      id: layer.id,
      label: layer.label,
      swatch: swatchFor(layer.kind),
    })),
  );
}
