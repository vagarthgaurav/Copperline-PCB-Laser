import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { buildBoardGeometry } from '@app/core/board-geometry';
import { GerberService } from '@app/core/gerber.service';
import { MachineService } from '@app/core/machine.service';
import { PlacementService } from '@app/core/placement.service';
import { ThemeService } from '@app/core/theme.service';
import { readPalette } from '@app/ui/peg-board-viewport/scene-palette';
import { ScenePalette } from '@app/ui/peg-board-viewport/scene.types';
import {
  BoardBitmap,
  FloorView,
  drawFloor,
  drawHead,
  dragToMm,
  fitFloor,
  fromCanvas,
  hitsWithin,
  placedGrabBounds,
  renderBoardBitmap,
  toCanvas,
} from './board-draw';

/** How far outside the board a touch still grabs it, in mm. A finger is about 10 mm wide. */
const GRAB_SLACK_MM = 6;
const NUDGE_MM = 1;
const NUDGE_FINE_MM = 0.1;

function round2(value: number): string {
  return (Math.round(value * 100) / 100 || 0).toFixed(1);
}

/**
 * Top-down 2D view of the peg board. Drag the board with a finger to move it
 * (it snaps to the peg grid like the desktop app); arrow keys nudge it 1 mm,
 * Shift 0.1 mm. While a job runs, the laser head follows the machine position.
 * The board art is drawn to a bitmap once per orientation, so dragging only
 * moves a picture, which a Raspberry Pi 3 can do smoothly.
 */
@Component({
  selector: 'kiosk-board-canvas',
  template: `
    <canvas
      #canvas
      tabindex="0"
      role="img"
      [attr.aria-label]="label()"
      [class.dragging]="dragging()"
      aria-describedby="kiosk-board-hint"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerEnd($event)"
      (pointercancel)="onPointerEnd($event)"
      (keydown)="onKey($event)"
    ></canvas>
    <span id="kiosk-board-hint" class="sr-only">Drag the board to move it. Arrow keys move it by one millimetre.</span>
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      border-radius: var(--radius-lg);
      background: var(--scene-bg);
      border: 1px solid var(--border);
    }

    canvas {
      display: block;
      width: 100%;
      height: 100%;
      /* Dragging the board must not scroll or zoom the page. */
      touch-action: none;
      cursor: grab;
    }

    canvas.dragging {
      cursor: grabbing;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
})
export class BoardCanvas {
  private readonly gerber = inject(GerberService);
  protected readonly placement = inject(PlacementService);
  private readonly machine = inject(MachineService);
  private readonly theme = inject(ThemeService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  private readonly size = signal({ width: 0, height: 0 });
  private palette: ScenePalette | null = null;
  private bitmap: BoardBitmap | null = null;
  private bitmapKey = '';
  private drag: { pointerId: number; startX: number; startY: number; offsetX: number; offsetY: number } | null = null;
  protected readonly dragging = signal(false);

  private readonly geometry = computed(() => {
    const project = this.gerber.project();
    return project ? buildBoardGeometry(project, this.placement.side()) : null;
  });

  protected readonly label = computed(() => {
    const board = this.gerber.project();
    if (!board) {
      return 'Peg board with no board loaded.';
    }
    const side = this.placement.side() === 'top' ? 'top' : 'bottom';
    return `${board.name} on the peg board, ${side} side, at X ${round2(this.placement.offsetX())} millimetres, Y ${round2(this.placement.offsetY())} millimetres.`;
  });

  constructor() {
    afterNextRender(() => {
      const element = this.host.nativeElement;
      const observer = new ResizeObserver(() => this.measure());
      observer.observe(element);
      this.measure();
      inject(DestroyRef).onDestroy(() => observer.disconnect());
    });

    effect(() => {
      this.size();
      this.theme.theme();
      this.geometry();
      this.placement.offsetX();
      this.placement.offsetY();
      this.placement.quarterTurns();
      this.machine.position();
      this.machine.jobState();
      this.dragging();
      untracked(() => this.paint());
    });
  }

  private measure(): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);
    const current = this.size();
    if (width > 0 && height > 0 && (width !== current.width || height !== current.height)) {
      this.size.set({ width, height });
    }
  }

  private view(): FloorView {
    const { width, height } = this.size();
    return fitFloor(width, height);
  }

  private paint(): void {
    const { width, height } = this.size();
    const canvas = this.canvasRef().nativeElement;
    if (width === 0 || height === 0) {
      return;
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    // The palette is re-read on every theme change because the tokens resolve per theme.
    this.palette = readPalette(canvas);
    const palette = this.palette;
    const view = this.view();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, width, height);
    drawFloor(ctx, view, palette);

    const geometry = this.geometry();
    if (geometry) {
      const turns = this.placement.quarterTurns();
      const mirrored = this.placement.side() === 'bottom';
      const key = `${this.gerber.project()?.name}|${this.placement.side()}|${turns}|${view.scale.toFixed(3)}|${this.theme.theme()}|${geometry.copper.length}`;
      if (key !== this.bitmapKey || this.bitmap === null) {
        this.bitmap = renderBoardBitmap(geometry, turns, mirrored, view.scale, palette);
        this.bitmapKey = key;
      }
      if (this.bitmap) {
        const at = toCanvas(view, this.placement.offsetX() + this.bitmap.originX, this.placement.offsetY() + this.bitmap.originY);
        ctx.drawImage(this.bitmap.canvas, Math.round(at.x), Math.round(at.y));
      }
    }

    const head = this.machine.position();
    if (head && this.machine.jobState() !== 'idle') {
      drawHead(ctx, view, head.x, head.y, palette);
    }
  }

  protected onPointerDown(event: PointerEvent): void {
    const geometry = this.geometry();
    if (!geometry || this.drag) {
      return;
    }
    const canvas = this.canvasRef().nativeElement;
    const rect = canvas.getBoundingClientRect();
    const view = this.view();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const { x: mmX, y: mmY } = fromCanvas(view, px, py);
    const grab = placedGrabBounds(
      geometry,
      this.placement.offsetX(),
      this.placement.offsetY(),
      this.placement.quarterTurns(),
      this.placement.side() === 'bottom',
    );
    if (!hitsWithin(grab, mmX, mmY, GRAB_SLACK_MM)) {
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    canvas.focus({ preventScroll: true });
    this.drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: this.placement.offsetX(),
      offsetY: this.placement.offsetY(),
    };
    this.dragging.set(true);
    event.preventDefault();
  }

  protected onPointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const move = dragToMm(this.view(), event.clientX - drag.startX, event.clientY - drag.startY);
    this.placement.setOffset(drag.offsetX + move.dx, drag.offsetY + move.dy);
  }

  protected onPointerEnd(event: PointerEvent): void {
    if (this.drag?.pointerId === event.pointerId) {
      this.drag = null;
      this.dragging.set(false);
    }
  }

  protected onKey(event: KeyboardEvent): void {
    const step = event.shiftKey ? NUDGE_FINE_MM : NUDGE_MM;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (move && this.geometry()) {
      event.preventDefault();
      this.placement.nudge(move[0], move[1]);
    }
  }
}
