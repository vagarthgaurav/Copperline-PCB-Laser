import { ComponentFixture, TestBed } from '@angular/core/testing';
import { floorBounds } from '../../core/peg-board';
import { ThemeService } from '../../core/theme.service';
import { PegBoardViewport, VIEW_HINT, WEBGL_UNAVAILABLE_MESSAGE } from './peg-board-viewport';
import { PEG_BOARD_SCENE_FACTORY } from './scene-factory';
import { BoardGeometry, PathSegment } from './scene.types';

interface FakeScene {
  canvas: HTMLCanvasElement;
  setPalette: ReturnType<typeof vi.fn>;
  setState: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  floorPoint: ReturnType<typeof vi.fn>;
  hitBoard: ReturnType<typeof vi.fn>;
  orbit: ReturnType<typeof vi.fn>;
  pan: ReturnType<typeof vi.fn>;
  panScreen: ReturnType<typeof vi.fn>;
  zoom: ReturnType<typeof vi.fn>;
  resetView: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  themeAtPalette: (string | undefined)[];
}

const mocked = { fail: false, scenes: [] as FakeScene[] };

function createFakeScene(canvas: HTMLCanvasElement): FakeScene {
  if (mocked.fail) {
    throw new Error('no WebGL');
  }
  const themeAtPalette: (string | undefined)[] = [];
  const scene: FakeScene = {
    canvas,
    themeAtPalette,
    setPalette: vi.fn(() => themeAtPalette.push(document.documentElement.dataset['theme'])),
    setState: vi.fn(),
    resize: vi.fn(),
    floorPoint: vi.fn(),
    hitBoard: vi.fn(() => false),
    orbit: vi.fn(),
    pan: vi.fn(),
    panScreen: vi.fn(),
    zoom: vi.fn(),
    resetView: vi.fn(),
    dispose: vi.fn(),
  };
  mocked.scenes.push(scene);
  return scene;
}

function geometry(width = 80, height = 55): BoardGeometry {
  return {
    bounds: { minX: 0, minY: 0, maxX: width, maxY: height },
    copper: new Float32Array(),
    outline: [],
    holes: [],
    blank: null,
    pegHoles: [],
  };
}

const PATH: PathSegment[] = [
  { line: 1, kind: 'rapid', x1: 0, y1: 0, x2: 10, y2: 0 },
  { line: 2, kind: 'feed', x1: 10, y1: 0, x2: 20, y2: 0 },
  { line: 3, kind: 'feed', x1: 20, y1: 0, x2: 40, y2: 0 },
  { line: 4, kind: 'feed', x1: 40, y1: 0, x2: 50, y2: 0 },
];

describe('PegBoardViewport', () => {
  let fixture: ComponentFixture<PegBoardViewport>;
  let el: HTMLElement;

  const scene = () => mocked.scenes[0];
  const frame = () => el.querySelector<HTMLElement>('.viewport')!;
  const canvas = () => el.querySelector<HTMLCanvasElement>('canvas')!;
  const chip = () => el.querySelector('.chip')!;
  const tool = (label: string) =>
    el.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  const set = (inputs: Record<string, unknown>) => {
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
  };

  async function setup(inputs: Record<string, unknown> = {}) {
    fixture = TestBed.createComponent(PegBoardViewport);
    el = fixture.nativeElement as HTMLElement;
    set(inputs);
    await fixture.whenStable();
  }

  function key(target: Element, init: KeyboardEventInit): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  }

  function pointer(
    type: string,
    clientX: number,
    clientY: number,
    pointerId = 1,
    init: MouseEventInit = {},
  ): MouseEvent {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      button: 0,
      ...init,
    });
    Object.defineProperty(event, 'pointerId', { value: pointerId });
    canvas().dispatchEvent(event);
    return event;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: PEG_BOARD_SCENE_FACTORY, useValue: createFakeScene }],
    });
    mocked.fail = false;
    mocked.scenes.length = 0;
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
  });

  afterEach(() => vi.unstubAllGlobals());

  describe('scene', () => {
    it('creates the scene on the canvas and gives it the palette and state', async () => {
      await setup({
        geometry: geometry(),
        offsetX: 12.5,
        offsetY: 6,
        quarterTurns: 1,
        mirrored: true,
        path: PATH,
        doneLine: 2,
      });
      expect(mocked.scenes.length).toBe(1);
      expect(scene().canvas).toBe(canvas());
      expect(scene().setPalette).toHaveBeenCalledTimes(1);
      const state = scene().setState.mock.lastCall![0];
      expect(state).toMatchObject({
        offsetX: 12.5,
        offsetY: 6,
        quarterTurns: 1,
        mirrored: true,
        doneLine: 2,
        tool: null,
      });
      expect(state.board).toBe(fixture.componentInstance.geometry());
      expect(state.path).toBe(PATH);
    });

    it('pushes the state again when an input changes', async () => {
      await setup();
      set({ offsetX: 3, tool: { x: 1, y: 2 } });
      await fixture.whenStable();
      expect(scene().setState.mock.lastCall![0]).toMatchObject({
        offsetX: 3,
        tool: { x: 1, y: 2 },
      });
    });

    it('shows a message and carries on when WebGL is unavailable', async () => {
      mocked.fail = true;
      await setup({ geometry: geometry() });
      expect(el.querySelector('.unavailable')?.textContent).toBe(WEBGL_UNAVAILABLE_MESSAGE);
      expect(WEBGL_UNAVAILABLE_MESSAGE).toBe('3D view unavailable: WebGL is not supported here.');
      expect(mocked.scenes.length).toBe(0);
      expect(tool('Rotate 90 degrees')).not.toBeNull();
    });

    it('shows no message when the scene is created', async () => {
      await setup();
      expect(el.querySelector('.unavailable')).toBeNull();
    });

    it('passes size changes to the scene with the device pixel ratio', async () => {
      let notify: ResizeObserverCallback = () => undefined;
      const observe = vi.fn();
      const disconnect = vi.fn();
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(callback: ResizeObserverCallback) {
            notify = callback;
          }
          observe = observe;
          disconnect = disconnect;
          unobserve = vi.fn();
        },
      );
      vi.stubGlobal('devicePixelRatio', 2);
      await setup();
      expect(observe).toHaveBeenCalledWith(frame());
      notify(
        [{ contentRect: { width: 640, height: 480 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      );
      expect(scene().resize).toHaveBeenCalledWith(640, 480, 2);
      fixture.destroy();
      expect(disconnect).toHaveBeenCalled();
    });

    it('disposes the scene when destroyed', async () => {
      await setup();
      fixture.destroy();
      expect(scene().dispose).toHaveBeenCalledTimes(1);
    });

    it('re-reads the palette after the theme attribute has changed', async () => {
      TestBed.inject(ThemeService).set('light');
      await setup();
      expect(scene().themeAtPalette).toEqual(['light']);
      TestBed.inject(ThemeService).set('dark');
      await fixture.whenStable();
      expect(scene().themeAtPalette).toEqual(['light', 'dark']);
    });
  });

  describe('chrome', () => {
    it('is a focusable named group with the canvas as an image', async () => {
      await setup();
      expect(frame().getAttribute('role')).toBe('group');
      expect(frame().getAttribute('aria-label')).toBe('Peg board viewport');
      expect(frame().tabIndex).toBe(0);
      expect(canvas().getAttribute('role')).toBe('img');
    });

    it('shows the offset with two decimals in a polite live region', async () => {
      await setup({ offsetX: 12.5, offsetY: 6 });
      const readout = el.querySelector('.bl .code')!;
      expect(readout.textContent).toBe('X 12.50 Y 6.00 mm');
      expect(readout.getAttribute('aria-live')).toBe('polite');
      expect(el.querySelector('.bl .label')?.textContent).toBe('Offset');
    });

    it('never shows negative zero', async () => {
      await setup({ offsetX: -0.001, offsetY: 0 });
      expect(el.querySelector('.bl .code')?.textContent).toBe('X 0.00 Y 0.00 mm');
    });

    it('lists the legend with text beside each swatch', async () => {
      await setup();
      const items = Array.from(el.querySelectorAll('.legend li')).map((li) =>
        li.textContent?.trim(),
      );
      expect(items).toEqual(['Board', 'Copper', 'Engraved', 'Laser']);
    });

    it('offers the three board tools, 32px buttons labelled for assistive tech', async () => {
      await setup();
      const group = el.querySelector('[aria-label="Board tools"]')!;
      expect(group.getAttribute('role')).toBe('group');
      expect(
        Array.from(group.querySelectorAll('button')).map((b) => b.getAttribute('aria-label')),
      ).toEqual(['Move board', 'Rotate 90 degrees', 'Flip board']);
    });

    it('hides the tools when not interactive, leaving the view group in the top-right slot', async () => {
      await setup({ interactive: false });
      expect(el.querySelector('[aria-label="Board tools"]')).toBeNull();
      const stack = el.querySelector('.stack')!;
      expect(stack.classList.contains('tr')).toBe(true);
      expect(stack.firstElementChild?.getAttribute('aria-label')).toBe('View');
    });

    it('puts the view group directly below the board tools in the same column', async () => {
      await setup();
      const groups = Array.from(el.querySelectorAll('.stack > [role=group]')).map((g) =>
        g.getAttribute('aria-label'),
      );
      expect(groups).toEqual(['Board tools', 'View']);
    });

    it('offers icon-only view buttons with shortcuts and tooltips', async () => {
      await setup();
      const group = el.querySelector('[aria-label="View"]')!;
      expect(group.getAttribute('role')).toBe('group');
      const buttons = Array.from(group.querySelectorAll('button'));
      expect(
        buttons.map((b) => [
          b.getAttribute('aria-label'),
          b.getAttribute('aria-keyshortcuts'),
          b.title,
        ]),
      ).toEqual([
        ['Zoom in', '+', 'Zoom in (+)'],
        ['Zoom out', '-', 'Zoom out (-)'],
        ['Reset view', '0', 'Reset view (0)'],
      ]);
      expect(buttons.every((b) => b.textContent?.trim() === '' && b.querySelector('svg'))).toBe(
        true,
      );
    });

    it('describes the navigation gestures and keys on the frame', async () => {
      await setup();
      const hint = el.querySelector(`#${frame().getAttribute('aria-describedby')}`)!;
      expect(hint.textContent).toBe(VIEW_HINT);
      expect(hint.textContent).toContain(
        'Drag to orbit, right-drag or Shift-drag to pan, scroll to zoom.',
      );
    });

    it('toggles the move tool and swaps its icon weight', async () => {
      await setup();
      const move = tool('Move board')!;
      expect(move.getAttribute('aria-pressed')).toBe('true');
      const pathOf = () => move.querySelector('path')!.getAttribute('d');
      const active = pathOf();
      move.click();
      await fixture.whenStable();
      expect(move.getAttribute('aria-pressed')).toBe('false');
      expect(pathOf()).not.toBe(active);
    });

    it('emits rotated and flipped from the one-shot tools', async () => {
      await setup();
      const rotated = vi.fn();
      const flipped = vi.fn();
      fixture.componentInstance.rotated.subscribe(rotated);
      fixture.componentInstance.flipped.subscribe(flipped);
      tool('Rotate 90 degrees')!.click();
      tool('Flip board')!.click();
      expect(rotated).toHaveBeenCalledTimes(1);
      expect(flipped).toHaveBeenCalledTimes(1);
    });
  });

  describe('side switch', () => {
    const radios = () =>
      Array.from(el.querySelectorAll<HTMLInputElement>('.seg input[type=radio]'));

    it('is a radiogroup of native radios sharing one name', async () => {
      await setup();
      expect(el.querySelector('.seg')?.getAttribute('role')).toBe('radiogroup');
      expect(el.querySelector('.seg')?.getAttribute('aria-label')).toBe('Board side');
      expect(radios().map((r) => r.parentElement?.textContent?.trim())).toEqual(['Top', 'Bottom']);
      expect(new Set(radios().map((r) => r.name)).size).toBe(1);
      expect(radios().map((r) => r.checked)).toEqual([true, false]);
    });

    it('updates the side model on change and follows it', async () => {
      await setup();
      radios()[1].click();
      await fixture.whenStable();
      expect(fixture.componentInstance.side()).toBe('bottom');
      fixture.componentInstance.side.set('top');
      await fixture.whenStable();
      expect(radios().map((r) => r.checked)).toEqual([true, false]);
    });
  });

  describe('status chip', () => {
    it('asks for a Gerber when there is no board', async () => {
      await setup();
      expect(chip().textContent?.trim()).toBe('Open a Gerber to place a board');
      expect(chip().getAttribute('role')).toBe('status');
    });

    it('says the board fits', async () => {
      await setup({ geometry: geometry(), offsetX: 12.5, offsetY: 6 });
      expect(chip().textContent?.trim()).toBe(
        'Board fits the peg grid · drag to move, arrow keys nudge 1 mm',
      );
      expect(chip().getAttribute('data-kind')).toBe('ok');
    });

    it('keeps it short when not interactive', async () => {
      await setup({ geometry: geometry(), interactive: false });
      expect(chip().textContent?.trim()).toBe('Board on the peg board');
    });

    it('warns when the board extends past the floor', async () => {
      // The 80 mm wide board overhangs the right edge of the floor by 10 mm.
      await setup({ geometry: geometry(), offsetX: floorBounds().maxX - 70 });
      expect(chip().textContent?.trim()).toBe('Board extends past the peg board');
      expect(chip().getAttribute('data-kind')).toBe('warn');
      set({ offsetX: 0, offsetY: -25 });
      await fixture.whenStable();
      expect(chip().getAttribute('data-kind')).toBe('warn');
    });

    it('swaps width and height for odd quarter turns', async () => {
      // 150 x 40 fits 100 mm under the top of the floor; turned a quarter it is 40 x 150 and overhangs.
      await setup({
        geometry: geometry(150, 40),
        offsetX: 0,
        offsetY: floorBounds().maxY - 100,
      });
      expect(chip().getAttribute('data-kind')).toBe('ok');
      set({ quarterTurns: 1 });
      await fixture.whenStable();
      expect(chip().getAttribute('data-kind')).toBe('warn');
      set({ quarterTurns: 2 });
      await fixture.whenStable();
      expect(chip().getAttribute('data-kind')).toBe('ok');
    });

    it('prefers the status input', async () => {
      await setup({ geometry: geometry(), status: 'Simulating' });
      expect(chip().textContent?.trim()).toBe('Simulating');
    });
  });

  describe('text alternative', () => {
    const label = () => canvas().getAttribute('aria-label');

    it('describes an empty peg board', async () => {
      await setup();
      expect(label()).toBe(
        'Peg board seen from above at an angle. No board is loaded. There is no engraving path yet, so nothing is engraved.',
      );
    });

    it('describes position and an untouched job', async () => {
      await setup({ geometry: geometry(), offsetX: 12.5, offsetY: 6, path: PATH });
      expect(label()).toBe(
        'Peg board seen from above at an angle. Top side of the board pegged at offset 12.50 millimetres in X and 6.00 in Y. Nothing is engraved yet.',
      );
    });

    it('mentions the side, rotation, laser head and engraved share', async () => {
      await setup({
        geometry: geometry(),
        quarterTurns: 3,
        path: PATH,
        doneLine: 3,
        tool: { x: 20, y: 0 },
      });
      fixture.componentInstance.side.set('bottom');
      await fixture.whenStable();
      const text = label()!;
      expect(text).toContain('Bottom side of the board pegged');
      expect(text).toContain('rotated 270 degrees clockwise');
      expect(text).toContain('The laser head is at X 20.00 and Y 0.00 millimetres.');
      expect(text).toContain('75 percent of the engraving path is engraved.');
    });

    it('says when everything is engraved', async () => {
      await setup({ geometry: geometry(), path: PATH, doneLine: 99 });
      expect(label()).toContain('The whole engraving path is engraved.');
    });
  });

  describe('arrow keys', () => {
    it('nudges by 1 mm, 0.1 mm with Shift, and prevents scrolling', async () => {
      await setup({ offsetX: 12.5, offsetY: 6 });
      const changes: { x: number; y: number }[] = [];
      fixture.componentInstance.offsetChange.subscribe((value) => changes.push(value));
      expect(key(frame(), { key: 'ArrowRight' }).defaultPrevented).toBe(true);
      key(frame(), { key: 'ArrowLeft' });
      key(frame(), { key: 'ArrowUp' });
      key(frame(), { key: 'ArrowDown', shiftKey: true });
      key(frame(), { key: 'ArrowRight', shiftKey: true });
      expect(changes).toEqual([
        { x: 13.5, y: 6 },
        { x: 11.5, y: 6 },
        { x: 12.5, y: 7 },
        { x: 12.5, y: 5.9 },
        { x: 12.6, y: 6 },
      ]);
    });

    it('steps by the snap pitch, with or without Shift, and says so in the chip', async () => {
      await setup({ geometry: geometry(), offsetX: 1, offsetY: 1, snapPitch: 10 });
      const changes: { x: number; y: number }[] = [];
      fixture.componentInstance.offsetChange.subscribe((value) => changes.push(value));
      key(frame(), { key: 'ArrowRight' });
      key(frame(), { key: 'ArrowDown', shiftKey: true });
      expect(changes).toEqual([
        { x: 11, y: 1 },
        { x: 1, y: -9 },
      ]);
      expect(chip().textContent).toContain('arrow keys step 10 mm');
    });

    it('ignores other keys and Meta-modified arrows, and never nudges for Alt or Ctrl arrows', async () => {
      await setup();
      const changes = vi.fn();
      fixture.componentInstance.offsetChange.subscribe(changes);
      expect(key(frame(), { key: 'a' }).defaultPrevented).toBe(false);
      expect(key(frame(), { key: 'ArrowRight', metaKey: true }).defaultPrevented).toBe(false);
      key(frame(), { key: 'ArrowRight', ctrlKey: true });
      key(frame(), { key: 'ArrowRight', altKey: true });
      key(frame(), { key: 'ArrowRight', ctrlKey: true, altKey: true });
      expect(changes).not.toHaveBeenCalled();
      expect(scene().panScreen).toHaveBeenCalledTimes(1);
      expect(scene().orbit).toHaveBeenCalledTimes(1);
    });

    it('leaves arrows pressed on the controls inside the frame alone', async () => {
      await setup();
      const changes = vi.fn();
      fixture.componentInstance.offsetChange.subscribe(changes);
      const event = key(el.querySelector('.seg input')!, { key: 'ArrowRight' });
      expect(event.defaultPrevented).toBe(false);
      expect(changes).not.toHaveBeenCalled();
    });

    it('does nothing when not interactive', async () => {
      await setup({ interactive: false });
      const changes = vi.fn();
      fixture.componentInstance.offsetChange.subscribe(changes);
      expect(key(frame(), { key: 'ArrowRight' }).defaultPrevented).toBe(false);
      expect(changes).not.toHaveBeenCalled();
    });
  });

  describe('dragging', () => {
    let changes: { x: number; y: number }[];

    async function setupDrag(inputs: Record<string, unknown> = {}) {
      await setup({ geometry: geometry(), offsetX: 10, offsetY: 5, ...inputs });
      changes = [];
      fixture.componentInstance.offsetChange.subscribe((value) => changes.push(value));
      scene().hitBoard.mockReturnValue(true);
      canvas().getBoundingClientRect = () => ({ left: 100, top: 50 }) as DOMRect;
      canvas().setPointerCapture = vi.fn();
      canvas().releasePointerCapture = vi.fn();
    }

    it('moves the board by the floor distance travelled, without jumping to the grab point', async () => {
      await setupDrag();
      scene().floorPoint.mockReturnValueOnce({ x: 40, y: 30 });
      pointer('pointerdown', 150, 100);
      expect(scene().hitBoard).toHaveBeenCalledWith(50, 50);
      expect(canvas().setPointerCapture).toHaveBeenCalledWith(1);
      scene().floorPoint.mockReturnValueOnce({ x: 52.346, y: 28.5 });
      pointer('pointermove', 170, 90);
      expect(scene().floorPoint).toHaveBeenLastCalledWith(70, 40);
      expect(changes).toEqual([{ x: 22.35, y: 3.5 }]);
      await fixture.whenStable();
      expect(canvas().style.cursor).toBe('grabbing');
    });

    it('compares against the offset input, so a consumer that snaps it keeps receiving the drag', async () => {
      await setupDrag({ snapPitch: 10 });
      scene().floorPoint.mockReturnValueOnce({ x: 40, y: 30 });
      pointer('pointerdown', 150, 100);
      // The consumer snaps these back to the unchanged (10, 5), so the input stays put.
      scene().floorPoint.mockReturnValue({ x: 42, y: 30 });
      pointer('pointermove', 160, 100);
      scene().floorPoint.mockReturnValue({ x: 43, y: 30 });
      pointer('pointermove', 170, 100);
      expect(changes).toEqual([
        { x: 12, y: 5 },
        { x: 13, y: 5 },
      ]);
      // Once the input has caught up with the pointer, nothing more is emitted.
      fixture.componentRef.setInput('offsetX', 20);
      scene().floorPoint.mockReturnValue({ x: 50, y: 30 });
      pointer('pointermove', 180, 100);
      expect(changes.length).toBe(2);
    });

    it('stops on pointer up and releases capture', async () => {
      await setupDrag();
      scene().floorPoint.mockReturnValue({ x: 40, y: 30 });
      pointer('pointerdown', 150, 100);
      pointer('pointerup', 150, 100);
      expect(canvas().releasePointerCapture).toHaveBeenCalledWith(1);
      scene().floorPoint.mockReturnValue({ x: 60, y: 30 });
      pointer('pointermove', 170, 100);
      expect(changes).toEqual([]);
    });

    it('orbits instead when the press is off the board or the ray misses the floor', async () => {
      await setupDrag();
      scene().hitBoard.mockReturnValue(false);
      pointer('pointerdown', 150, 100);
      pointer('pointermove', 160, 100);
      pointer('pointerup', 160, 100);
      scene().hitBoard.mockReturnValue(true);
      scene().floorPoint.mockReturnValue(null);
      pointer('pointerdown', 150, 100);
      pointer('pointermove', 160, 100);
      pointer('pointerup', 160, 100);
      expect(changes).toEqual([]);
      expect(scene().orbit).toHaveBeenCalledTimes(2);
    });

    it('ignores other pointers and moves that do not change the offset', async () => {
      await setupDrag();
      scene().floorPoint.mockReturnValue({ x: 40, y: 30 });
      pointer('pointerdown', 150, 100, 1);
      pointer('pointermove', 160, 100, 2);
      pointer('pointermove', 150, 100, 1);
      expect(changes).toEqual([]);
    });

    it('does not drag when the move tool is off or the viewport is not interactive', async () => {
      await setupDrag();
      scene().floorPoint.mockReturnValue({ x: 40, y: 30 });
      tool('Move board')!.click();
      await fixture.whenStable();
      pointer('pointerdown', 150, 100);
      scene().floorPoint.mockReturnValue({ x: 50, y: 30 });
      pointer('pointermove', 160, 100);
      pointer('pointerup', 160, 100);
      expect(changes).toEqual([]);
      expect(scene().orbit).toHaveBeenCalledTimes(1);

      set({ interactive: false });
      await fixture.whenStable();
      pointer('pointerdown', 150, 100);
      pointer('pointermove', 160, 100);
      expect(changes).toEqual([]);
      expect(scene().orbit).toHaveBeenCalledTimes(2);
    });

    it('shows a grab cursor over the board', async () => {
      await setupDrag();
      expect(canvas().style.cursor).toBe('default');
      pointer('pointermove', 150, 100);
      await fixture.whenStable();
      expect(canvas().style.cursor).toBe('grab');
      canvas().dispatchEvent(new MouseEvent('pointerleave'));
      await fixture.whenStable();
      expect(canvas().style.cursor).toBe('default');
    });
  });

  describe('camera navigation', () => {
    async function setupNav(inputs: Record<string, unknown> = {}) {
      await setup({ geometry: geometry(), offsetX: 10, offsetY: 5, ...inputs });
      scene().floorPoint.mockReturnValue({ x: 40, y: 30 });
      canvas().getBoundingClientRect = () => ({ left: 100, top: 50, height: 400 }) as DOMRect;
      canvas().setPointerCapture = vi.fn();
      canvas().releasePointerCapture = vi.fn();
    }

    function wheel(init: WheelEventInit): WheelEvent {
      const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
      canvas().dispatchEvent(event);
      return event;
    }

    describe('orbit', () => {
      it('orbits on a drag over empty space: dragging right swings the camera left, down raises it', async () => {
        await setupNav();
        const moved = vi.fn();
        fixture.componentInstance.offsetChange.subscribe(moved);
        pointer('pointerdown', 200, 150);
        expect(canvas().setPointerCapture).toHaveBeenCalledWith(1);
        pointer('pointermove', 210, 160);
        expect(scene().orbit).toHaveBeenLastCalledWith(-4, 3);
        pointer('pointermove', 205, 150);
        expect(scene().orbit).toHaveBeenLastCalledWith(2, -3);
        await fixture.whenStable();
        expect(canvas().style.cursor).toBe('grabbing');
        pointer('pointerup', 205, 150);
        expect(canvas().releasePointerCapture).toHaveBeenCalledWith(1);
        pointer('pointermove', 300, 300);
        expect(scene().orbit).toHaveBeenCalledTimes(2);
        expect(moved).not.toHaveBeenCalled();
        expect(scene().pan).not.toHaveBeenCalled();
      });

      it('orbits everywhere when not interactive, even over the board', async () => {
        await setupNav({ interactive: false });
        scene().hitBoard.mockReturnValue(true);
        const moved = vi.fn();
        fixture.componentInstance.offsetChange.subscribe(moved);
        pointer('pointerdown', 200, 150);
        pointer('pointermove', 220, 150);
        expect(scene().orbit).toHaveBeenCalledWith(-8, 0);
        expect(moved).not.toHaveBeenCalled();
      });

      it('lets the board drag win over the board and never orbits then', async () => {
        await setupNav();
        scene().hitBoard.mockReturnValue(true);
        const moved = vi.fn();
        fixture.componentInstance.offsetChange.subscribe(moved);
        pointer('pointerdown', 200, 150);
        scene().floorPoint.mockReturnValue({ x: 45, y: 30 });
        pointer('pointermove', 220, 150);
        expect(moved).toHaveBeenCalledWith({ x: 15, y: 5 });
        expect(scene().orbit).not.toHaveBeenCalled();
        expect(scene().pan).not.toHaveBeenCalled();
      });

      it('runs only one gesture at a time', async () => {
        await setupNav();
        pointer('pointerdown', 200, 150, 1);
        pointer('pointerdown', 300, 300, 2, { button: 2 });
        pointer('pointermove', 210, 150, 2);
        expect(scene().pan).not.toHaveBeenCalled();
        expect(scene().orbit).not.toHaveBeenCalled();
        pointer('pointermove', 210, 150, 1);
        expect(scene().orbit).toHaveBeenCalledTimes(1);
      });
    });

    describe('pan', () => {
      it('pans with the right button, from the previous canvas point to the new one', async () => {
        await setupNav();
        pointer('pointerdown', 200, 150, 1, { button: 2 });
        pointer('pointermove', 210, 170);
        expect(scene().pan).toHaveBeenLastCalledWith(100, 100, 110, 120);
        pointer('pointermove', 215, 170);
        expect(scene().pan).toHaveBeenLastCalledWith(110, 120, 115, 120);
        await fixture.whenStable();
        expect(canvas().style.cursor).toBe('move');
        expect(scene().orbit).not.toHaveBeenCalled();
      });

      it('pans with the middle button and prevents autoscroll', async () => {
        await setupNav();
        expect(pointer('pointerdown', 200, 150, 1, { button: 1 }).defaultPrevented).toBe(true);
        pointer('pointermove', 210, 150);
        expect(scene().pan).toHaveBeenCalledWith(100, 100, 110, 100);
      });

      it('pans with Shift+left over the board and never moves it', async () => {
        await setupNav();
        scene().hitBoard.mockReturnValue(true);
        const moved = vi.fn();
        fixture.componentInstance.offsetChange.subscribe(moved);
        pointer('pointerdown', 200, 150, 1, { shiftKey: true });
        pointer('pointermove', 230, 150);
        expect(scene().pan).toHaveBeenCalledWith(100, 100, 130, 100);
        expect(moved).not.toHaveBeenCalled();
        expect(scene().orbit).not.toHaveBeenCalled();
      });

      it('pans when not interactive', async () => {
        await setupNav({ interactive: false });
        pointer('pointerdown', 200, 150, 1, { button: 2 });
        pointer('pointermove', 210, 150);
        expect(scene().pan).toHaveBeenCalledTimes(1);
      });

      it('suppresses the context menu on the canvas', async () => {
        await setupNav();
        const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        canvas().dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
      });
    });

    describe('wheel', () => {
      it('zooms toward the cursor, exponential in deltaY, and prevents page scroll', async () => {
        await setupNav();
        const event = wheel({ deltaY: -100, clientX: 250, clientY: 200 });
        expect(event.defaultPrevented).toBe(true);
        expect(scene().zoom).toHaveBeenCalledTimes(1);
        const [factor, x, y] = scene().zoom.mock.lastCall!;
        expect(factor).toBeCloseTo(Math.exp(0.15), 10);
        expect([x, y]).toEqual([150, 150]);
        wheel({ deltaY: 100, clientX: 250, clientY: 200 });
        expect(scene().zoom.mock.lastCall![0]).toBeCloseTo(Math.exp(-0.15), 10);
      });

      it('normalises lines and pages to pixels', async () => {
        await setupNav();
        wheel({ deltaY: 3, deltaMode: 1 });
        expect(scene().zoom.mock.lastCall![0]).toBeCloseTo(Math.exp(-3 * 16 * 0.0015), 10);
        wheel({ deltaY: 1, deltaMode: 2 });
        expect(scene().zoom.mock.lastCall![0]).toBeCloseTo(Math.exp(-400 * 0.0015), 10);
      });

      it('registers a non-passive listener and removes it on destroy', async () => {
        const add = vi.spyOn(HTMLCanvasElement.prototype, 'addEventListener');
        const remove = vi.spyOn(HTMLCanvasElement.prototype, 'removeEventListener');
        await setupNav();
        expect(add).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false });
        fixture.destroy();
        expect(remove).toHaveBeenCalledWith(
          'wheel',
          add.mock.calls.find((c) => c[0] === 'wheel')![1],
        );
        add.mockRestore();
        remove.mockRestore();
      });
    });

    describe('keyboard', () => {
      it('zooms with plus, equals, minus and underscore, and resets with zero', async () => {
        await setupNav();
        for (const k of ['+', '=']) {
          expect(key(frame(), { key: k }).defaultPrevented).toBe(true);
        }
        for (const k of ['-', '_']) {
          expect(key(frame(), { key: k }).defaultPrevented).toBe(true);
        }
        expect(scene().zoom.mock.calls).toEqual([[1.25], [1.25], [1 / 1.25], [1 / 1.25]]);
        expect(key(frame(), { key: '0' }).defaultPrevented).toBe(true);
        expect(scene().resetView).toHaveBeenCalledTimes(1);
      });

      it('orbits 5 degrees with Alt+arrows: left and right swing, up and down tilt', async () => {
        await setupNav();
        expect(key(frame(), { key: 'ArrowLeft', altKey: true }).defaultPrevented).toBe(true);
        key(frame(), { key: 'ArrowRight', altKey: true });
        key(frame(), { key: 'ArrowUp', altKey: true });
        key(frame(), { key: 'ArrowDown', altKey: true });
        expect(scene().orbit.mock.calls).toEqual([
          [-5, 0],
          [5, 0],
          [0, 5],
          [0, -5],
        ]);
      });

      it('pans 5% of the view with Ctrl+arrows', async () => {
        await setupNav();
        expect(key(frame(), { key: 'ArrowRight', ctrlKey: true }).defaultPrevented).toBe(true);
        key(frame(), { key: 'ArrowLeft', ctrlKey: true });
        key(frame(), { key: 'ArrowUp', ctrlKey: true });
        key(frame(), { key: 'ArrowDown', ctrlKey: true });
        expect(scene().panScreen.mock.calls).toEqual([
          [0.05, 0],
          [-0.05, 0],
          [0, 0.05],
          [0, -0.05],
        ]);
      });

      it('works when not interactive, but leaves keys on inner controls alone', async () => {
        await setupNav({ interactive: false });
        key(frame(), { key: '+' });
        key(frame(), { key: 'ArrowLeft', altKey: true });
        expect(scene().zoom).toHaveBeenCalledTimes(1);
        expect(scene().orbit).toHaveBeenCalledTimes(1);
        const event = key(el.querySelector('.seg input')!, { key: '+' });
        expect(event.defaultPrevented).toBe(false);
        expect(scene().zoom).toHaveBeenCalledTimes(1);
      });

      it('leaves browser shortcuts (Ctrl+minus, Ctrl+0) and Meta alone', async () => {
        await setupNav();
        expect(key(frame(), { key: '-', ctrlKey: true }).defaultPrevented).toBe(false);
        expect(key(frame(), { key: '0', ctrlKey: true }).defaultPrevented).toBe(false);
        expect(key(frame(), { key: '+', metaKey: true }).defaultPrevented).toBe(false);
        expect(scene().zoom).not.toHaveBeenCalled();
        expect(scene().resetView).not.toHaveBeenCalled();
      });
    });

    describe('view buttons', () => {
      it('zoom about the view centre by a quarter step and reset', async () => {
        await setupNav();
        tool('Zoom in')!.click();
        tool('Zoom out')!.click();
        tool('Reset view')!.click();
        expect(scene().zoom.mock.calls).toEqual([[1.25], [1 / 1.25]]);
        expect(scene().resetView).toHaveBeenCalledTimes(1);
      });
    });
  });
});
