import { DOCUMENT } from '@angular/common';
import {
  DestroyRef,
  Injector,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { floorBounds } from '../../core/peg-board';
import { ThemeService } from '../../core/theme.service';
import { Icon } from '../icon/icon';
import { IconName } from '../icon/icons';
import { engravedShare, feedLength, feedProfile } from './engraving-progress';
import { readPalette } from './scene-palette';
import { PEG_BOARD_SCENE_FACTORY } from './scene-factory';
import { BoardGeometry, PathSegment, PegBoardSceneApi } from './scene.types';

export type ViewportSide = 'top' | 'bottom';

export const WEBGL_UNAVAILABLE_MESSAGE = '3D view unavailable: WebGL is not supported here.';

/** Arrow-key nudge in mm; Shift makes it finer. */
const NUDGE = 1;
const NUDGE_FINE = 0.1;

/** Orbit sensitivity in degrees per pixel of drag. */
const ORBIT_AZIMUTH_PER_PX = 0.4;
const ORBIT_ELEVATION_PER_PX = 0.3;
/** Wheel zoom: factor = exp(-deltaY * WHEEL_ZOOM); lines and pages are converted to pixels first. */
const WHEEL_ZOOM = 0.0015;
const WHEEL_LINE_PX = 16;
/** One step of the zoom buttons and the +/- keys. */
const ZOOM_STEP = 1.25;
/** Keyboard orbit step in degrees, and keyboard pan step as a share of the canvas. */
const KEY_ORBIT = 5;
const KEY_PAN = 0.05;

export const VIEW_HINT =
  'Drag to orbit, right-drag or Shift-drag to pan, scroll to zoom. Plus and minus zoom, zero resets the view, Alt and arrow keys orbit, Control and arrow keys pan.';

type Gesture = 'move' | 'orbit' | 'pan';

let nextId = 0;

function round2(value: number): number {
  return Math.round(value * 100) / 100 || 0;
}

/** Formats a mm value with two decimals and never "-0.00". */
function fixed(value: number): string {
  return (Math.round(value * 100) / 100 || 0).toFixed(2);
}

type ChipKind = 'info' | 'ok' | 'warn';

/**
 * Frame of the 3D viewport: owns the canvas and the Three.js scene, draws the
 * HTML chrome on top (side switch, status chip, board tools, offset chip,
 * legend) and turns pointer drags and arrow keys into `offsetChange`. All
 * state comes in through inputs; the consumer decides what to do with the
 * outputs.
 */
@Component({
  selector: 'app-peg-board-viewport',
  imports: [Icon],
  templateUrl: './peg-board-viewport.html',
  styleUrl: './peg-board-viewport.scss',
})
export class PegBoardViewport {
  /** Triangulated board for the current side; null shows an empty peg board. */
  readonly geometry = input<BoardGeometry | null>(null);
  readonly offsetX = input(0);
  readonly offsetY = input(0);
  /** Clockwise quarter turns seen from above, 0..3. */
  readonly quarterTurns = input(0);
  /** Board flipped over (the Bottom side). */
  readonly mirrored = input(false);
  readonly path = input<readonly PathSegment[]>([]);
  /** Feed moves up to this 1-based G-code line are drawn as engraved. */
  readonly doneLine = input(0);
  /** Laser head XY in machine mm; null hides it. */
  readonly tool = input<{ x: number; y: number } | null>(null);
  /** False hides the board tools and disables moving the board and arrow-key nudging; the camera still moves. */
  readonly interactive = input(true);
  /** Peg-grid pitch in mm when the consumer snaps the board to it; arrow keys then step by it. */
  readonly snapPitch = input<number | null>(null);
  /** Replaces the default status chip text. */
  readonly status = input<string>();

  readonly side = model<ViewportSide>('top');

  readonly offsetChange = output<{ x: number; y: number }>();
  readonly rotated = output<void>();
  readonly flipped = output<void>();

  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly theme = inject(ThemeService);
  private readonly createSceneFor = inject(PEG_BOARD_SCENE_FACTORY);

  private readonly frame = viewChild.required<ElementRef<HTMLElement>>('frame');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  private readonly scene = signal<PegBoardSceneApi | null>(null);
  private resizeObserver?: ResizeObserver;
  /** The one pointer gesture in progress. `lastX/Y` are the previous canvas point (orbit, pan); the rest is for moving the board. */
  private drag: {
    kind: Gesture;
    pointerId: number;
    lastX: number;
    lastY: number;
    startX: number;
    startY: number;
    grabX: number;
    grabY: number;
  } | null = null;

  protected readonly sideGroup = `peg-board-side-${nextId++}`;
  protected readonly unavailable = signal(false);
  protected readonly moveActive = signal(true);
  protected readonly gesture = signal<Gesture | null>(null);
  protected readonly hintId = `peg-board-hint-${nextId++}`;
  protected readonly viewHint = VIEW_HINT;
  protected readonly overBoard = signal(false);
  protected readonly unavailableMessage = WEBGL_UNAVAILABLE_MESSAGE;

  private readonly canDrag = computed(() => this.interactive() && this.moveActive());
  protected readonly cursor = computed(() => {
    switch (this.gesture()) {
      case 'move':
      case 'orbit':
        return 'grabbing';
      case 'pan':
        return 'move';
    }
    return this.canDrag() && this.overBoard() ? 'grab' : 'default';
  });

  protected readonly offsetText = computed(
    () => `X ${fixed(this.offsetX())} Y ${fixed(this.offsetY())} mm`,
  );

  private readonly profile = computed(() => feedProfile(this.path()));
  private readonly share = computed(() => engravedShare(this.profile(), this.doneLine()));

  /** True when the board, rotated and placed at the offset, lies inside the floor rectangle. */
  private readonly fits = computed(() => {
    const geometry = this.geometry();
    if (!geometry) {
      return true;
    }
    const { minX, minY, maxX, maxY } = geometry.bounds;
    const odd = this.quarterTurns() % 2 === 1;
    const width = odd ? maxY - minY : maxX - minX;
    const height = odd ? maxX - minX : maxY - minY;
    const floor = floorBounds();
    const x = this.offsetX();
    const y = this.offsetY();
    return (
      x >= floor.minX && y >= floor.minY && x + width <= floor.maxX && y + height <= floor.maxY
    );
  });

  private readonly keyHint = computed(() => {
    const pitch = this.snapPitch();
    return pitch === null ? 'nudge 1 mm' : `step ${pitch} mm`;
  });

  protected readonly chip = computed<{ kind: ChipKind; icon: IconName; text: string }>(() => {
    const custom = this.status();
    if (custom) {
      return { kind: 'info', icon: 'cube', text: custom };
    }
    if (!this.geometry()) {
      return { kind: 'info', icon: 'cube', text: 'Open a Gerber to place a board' };
    }
    if (!this.fits()) {
      return { kind: 'warn', icon: 'warning', text: 'Board extends past the peg board' };
    }
    return {
      kind: 'ok',
      icon: 'check-circle',
      text: this.interactive()
        ? `Board fits the peg grid · drag to move, arrow keys ${this.keyHint()}`
        : 'Board on the peg board',
    };
  });

  /** Text alternative for the canvas, kept in step with the state. */
  protected readonly sceneLabel = computed(() => {
    const parts = ['Peg board seen from above at an angle.'];
    if (!this.geometry()) {
      parts.push('No board is loaded.');
    } else {
      const side = this.side() === 'top' ? 'Top' : 'Bottom';
      const turns = this.quarterTurns() * 90;
      parts.push(
        `${side} side of the board pegged at offset ${fixed(this.offsetX())} millimetres in X and ${fixed(this.offsetY())} in Y${
          turns ? `, rotated ${turns} degrees clockwise` : ''
        }.`,
      );
    }
    const tool = this.tool();
    if (tool) {
      parts.push(`The laser head is at X ${fixed(tool.x)} and Y ${fixed(tool.y)} millimetres.`);
    }
    if (feedLength(this.profile()) <= 0) {
      parts.push('There is no engraving path yet, so nothing is engraved.');
    } else {
      const percent = Math.round(this.share() * 100);
      if (percent <= 0) {
        parts.push('Nothing is engraved yet.');
      } else if (percent >= 100) {
        parts.push('The whole engraving path is engraved.');
      } else {
        parts.push(`${percent} percent of the engraving path is engraved.`);
      }
    }
    return parts.join(' ');
  });

  constructor() {
    afterNextRender(() => this.createScene());

    // Angular's (wheel) binding is passive, so preventDefault would be ignored; register by hand.
    afterNextRender(() => {
      const canvas = this.canvas().nativeElement;
      const onWheel = (event: WheelEvent) => this.onWheel(event);
      canvas.addEventListener('wheel', onWheel, { passive: false });
      this.destroyRef.onDestroy(() => canvas.removeEventListener('wheel', onWheel));
    });

    // Push the state whenever an input changes (and once the scene exists).
    effect(() => {
      const scene = this.scene();
      const state = {
        board: this.geometry(),
        offsetX: this.offsetX(),
        offsetY: this.offsetY(),
        quarterTurns: this.quarterTurns(),
        mirrored: this.mirrored(),
        path: this.path(),
        doneLine: this.doneLine(),
        tool: this.tool(),
      };
      scene?.setState(state);
    });

    // Re-read the palette after a theme change. ThemeService writes
    // `<html data-theme>` in its own effect; reading in afterNextRender runs
    // after every effect of this tick, so the new token values are in place.
    effect(() => {
      this.theme.theme();
      const scene = untracked(this.scene);
      if (scene) {
        afterNextRender(() => scene.setPalette(readPalette(this.frame().nativeElement)), {
          injector: this.injector,
        });
      }
    });

    this.destroyRef.onDestroy(() => {
      this.resizeObserver?.disconnect();
      this.scene()?.dispose();
    });
  }

  private createScene(): void {
    const canvas = this.canvas().nativeElement;
    const frame = this.frame().nativeElement;
    let scene: PegBoardSceneApi;
    try {
      scene = this.createSceneFor(canvas);
    } catch {
      this.unavailable.set(true);
      return;
    }
    scene.setPalette(readPalette(frame));

    const pixelRatio = () => this.document.defaultView?.devicePixelRatio ?? 1;
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver((entries) => {
        const rect = entries[entries.length - 1]?.contentRect;
        if (rect && rect.width > 0 && rect.height > 0) {
          scene.resize(rect.width, rect.height, pixelRatio());
        }
      });
      this.resizeObserver.observe(frame);
    }
    const { clientWidth, clientHeight } = frame;
    if (clientWidth > 0 && clientHeight > 0) {
      scene.resize(clientWidth, clientHeight, pixelRatio());
    }
    this.scene.set(scene);
  }

  protected onSideChange(side: ViewportSide): void {
    this.side.set(side);
  }

  protected toggleMove(): void {
    this.moveActive.update((active) => !active);
    this.overBoard.set(false);
  }

  protected onKeydown(event: KeyboardEvent): void {
    // Keys pressed on the radios and buttons inside the frame keep their own meaning.
    if (event.target !== event.currentTarget || event.metaKey) {
      return;
    }
    if (this.onViewKey(event)) {
      event.preventDefault();
      return;
    }
    if (!this.interactive() || event.ctrlKey || event.altKey) {
      return;
    }
    // Shift's finer step would be snapped away, so a snapping board always steps one pitch.
    const pitch = this.snapPitch();
    const step = pitch ?? (event.shiftKey ? NUDGE_FINE : NUDGE);
    let dx = 0;
    let dy = 0;
    switch (event.key) {
      case 'ArrowLeft':
        dx = -step;
        break;
      case 'ArrowRight':
        dx = step;
        break;
      case 'ArrowUp':
        dy = step;
        break;
      case 'ArrowDown':
        dy = -step;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.offsetChange.emit({ x: round2(this.offsetX() + dx), y: round2(this.offsetY() + dy) });
  }

  /**
   * Camera keys: + - zoom, 0 resets, Alt+arrows orbit, Ctrl+arrows pan. Returns
   * whether the key was one of them. They work when the view is not interactive too.
   */
  private onViewKey(event: KeyboardEvent): boolean {
    const scene = this.scene();
    if (!scene) {
      return false;
    }
    if (!event.ctrlKey && !event.altKey) {
      switch (event.key) {
        case '+':
        case '=':
          scene.zoom(ZOOM_STEP);
          return true;
        case '-':
        case '_':
          scene.zoom(1 / ZOOM_STEP);
          return true;
        case '0':
          scene.resetView();
          return true;
        default:
          return false;
      }
    }
    if (event.ctrlKey === event.altKey) {
      return false;
    }
    // Direction on screen: x right, y up.
    let x = 0;
    let y = 0;
    switch (event.key) {
      case 'ArrowLeft':
        x = -1;
        break;
      case 'ArrowRight':
        x = 1;
        break;
      case 'ArrowUp':
        y = 1;
        break;
      case 'ArrowDown':
        y = -1;
        break;
      default:
        return false;
    }
    if (event.altKey) {
      scene.orbit(x * KEY_ORBIT, y * KEY_ORBIT);
    } else {
      scene.panScreen(x * KEY_PAN, y * KEY_PAN);
    }
    return true;
  }

  protected zoomIn(): void {
    this.scene()?.zoom(ZOOM_STEP);
  }

  protected zoomOut(): void {
    this.scene()?.zoom(1 / ZOOM_STEP);
  }

  protected resetView(): void {
    this.scene()?.resetView();
  }

  private onWheel(event: WheelEvent): void {
    const scene = this.scene();
    if (!scene) {
      return;
    }
    event.preventDefault();
    let delta = event.deltaY;
    if (event.deltaMode === 1) {
      delta *= WHEEL_LINE_PX;
    } else if (event.deltaMode === 2) {
      delta *= this.canvas().nativeElement.getBoundingClientRect().height;
    }
    const { x, y } = this.canvasPoint(event);
    scene.zoom(Math.exp(-delta * WHEEL_ZOOM), x, y);
  }

  protected onContextMenu(event: Event): void {
    event.preventDefault();
  }

  /**
   * Left button on the board (Move tool on, interactive) moves it. Right or
   * middle button, or Shift+left, pans; any other left drag orbits.
   */
  protected onPointerDown(event: PointerEvent): void {
    const scene = this.scene();
    if (!scene || this.drag) {
      return;
    }
    const { x, y } = this.canvasPoint(event);
    let kind: Gesture;
    let grab: { x: number; y: number } | null = null;
    if (event.button === 1 || event.button === 2 || (event.button === 0 && event.shiftKey)) {
      kind = 'pan';
    } else if (event.button === 0) {
      kind = 'orbit';
      if (this.canDrag() && scene.hitBoard(x, y)) {
        grab = scene.floorPoint(x, y);
        if (grab) {
          kind = 'move';
        }
      }
    } else {
      return;
    }
    if (event.button === 1) {
      // Would otherwise start the browser's autoscroll.
      event.preventDefault();
    }
    this.canvas().nativeElement.setPointerCapture?.(event.pointerId);
    this.drag = {
      kind,
      pointerId: event.pointerId,
      lastX: x,
      lastY: y,
      startX: this.offsetX(),
      startY: this.offsetY(),
      grabX: grab?.x ?? 0,
      grabY: grab?.y ?? 0,
    };
    this.gesture.set(kind);
  }

  protected onPointerMove(event: PointerEvent): void {
    const scene = this.scene();
    if (!scene) {
      return;
    }
    const { x, y } = this.canvasPoint(event);
    const drag = this.drag;
    if (!drag) {
      this.overBoard.set(this.canDrag() && scene.hitBoard(x, y));
      return;
    }
    if (event.pointerId !== drag.pointerId) {
      return;
    }
    if (drag.kind === 'move') {
      const point = scene.floorPoint(x, y);
      if (!point) {
        return;
      }
      const nextX = round2(drag.startX + point.x - drag.grabX);
      const nextY = round2(drag.startY + point.y - drag.grabY);
      if (nextX !== this.offsetX() || nextY !== this.offsetY()) {
        this.offsetChange.emit({ x: nextX, y: nextY });
      }
      return;
    }
    if (drag.kind === 'pan') {
      scene.pan(drag.lastX, drag.lastY, x, y);
    } else {
      // Dragging right swings the camera left; dragging down raises it.
      scene.orbit(
        -(x - drag.lastX) * ORBIT_AZIMUTH_PER_PX,
        (y - drag.lastY) * ORBIT_ELEVATION_PER_PX,
      );
    }
    drag.lastX = x;
    drag.lastY = y;
  }

  protected onPointerEnd(event: PointerEvent): void {
    if (this.drag && this.drag.pointerId === event.pointerId) {
      this.canvas().nativeElement.releasePointerCapture?.(event.pointerId);
      this.drag = null;
      this.gesture.set(null);
    }
  }

  protected onPointerLeave(): void {
    if (!this.drag) {
      this.overBoard.set(false);
    }
  }

  private canvasPoint(event: MouseEvent): { x: number; y: number } {
    const rect = this.canvas().nativeElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
}
