import { TestBed } from '@angular/core/testing';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WindowService } from './window.service';

vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn() }));

interface FakeWindow {
  isMaximized: ReturnType<typeof vi.fn>;
  isFocused: ReturnType<typeof vi.fn>;
  onResized: ReturnType<typeof vi.fn>;
  onFocusChanged: ReturnType<typeof vi.fn>;
  minimize: ReturnType<typeof vi.fn>;
  toggleMaximize: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  resize(): void;
  focus(focused: boolean): void;
  unlistenResized: ReturnType<typeof vi.fn>;
  unlistenFocus: ReturnType<typeof vi.fn>;
}

function fakeWindow(): FakeWindow {
  let onResize: () => void = () => undefined;
  let onFocus: (event: { payload: boolean }) => void = () => undefined;
  const unlistenResized = vi.fn();
  const unlistenFocus = vi.fn();
  const fake: FakeWindow = {
    isMaximized: vi.fn().mockResolvedValue(false),
    isFocused: vi.fn().mockResolvedValue(true),
    onResized: vi.fn().mockImplementation((handler: () => void) => {
      onResize = handler;
      return Promise.resolve(unlistenResized);
    }),
    onFocusChanged: vi.fn().mockImplementation((handler: (event: { payload: boolean }) => void) => {
      onFocus = handler;
      return Promise.resolve(unlistenFocus);
    }),
    minimize: vi.fn().mockResolvedValue(undefined),
    toggleMaximize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    resize: () => onResize(),
    focus: (focused) => onFocus({ payload: focused }),
    unlistenResized,
    unlistenFocus,
  };
  return fake;
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve));

function setTauri(present: boolean) {
  if (present) {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
  } else {
    delete (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'];
  }
}

describe('WindowService', () => {
  afterEach(() => {
    setTauri(false);
    vi.mocked(getCurrentWindow).mockReset();
  });

  describe('outside Tauri', () => {
    it('defaults the signals and makes the actions no-ops', () => {
      setTauri(false);
      const service = TestBed.inject(WindowService);

      expect(getCurrentWindow).not.toHaveBeenCalled();
      expect(service.maximized()).toBe(false);
      expect(service.focused()).toBe(true);
      expect(() => {
        service.minimize();
        service.toggleMaximize();
        service.close();
      }).not.toThrow();
    });
  });

  describe('inside Tauri', () => {
    let win: FakeWindow;

    beforeEach(() => {
      setTauri(true);
      win = fakeWindow();
      vi.mocked(getCurrentWindow).mockReturnValue(win as unknown as ReturnType<typeof getCurrentWindow>);
    });

    it('reads the initial maximized and focused state', async () => {
      win.isMaximized.mockResolvedValue(true);
      win.isFocused.mockResolvedValue(false);
      const service = TestBed.inject(WindowService);
      await flush();

      expect(service.maximized()).toBe(true);
      expect(service.focused()).toBe(false);
    });

    it('re-reads maximized on resize and follows focus changes', async () => {
      const service = TestBed.inject(WindowService);
      await flush();
      expect(service.maximized()).toBe(false);

      win.isMaximized.mockResolvedValue(true);
      win.resize();
      await flush();
      expect(service.maximized()).toBe(true);

      win.focus(false);
      expect(service.focused()).toBe(false);
      win.focus(true);
      expect(service.focused()).toBe(true);
    });

    it('delegates the window actions', () => {
      const service = TestBed.inject(WindowService);
      service.minimize();
      service.toggleMaximize();
      service.close();

      expect(win.minimize).toHaveBeenCalledOnce();
      expect(win.toggleMaximize).toHaveBeenCalledOnce();
      expect(win.close).toHaveBeenCalledOnce();
    });

    it('removes both listeners when destroyed', async () => {
      TestBed.inject(WindowService);
      await flush();
      expect(win.unlistenResized).not.toHaveBeenCalled();

      TestBed.resetTestingModule();
      expect(win.unlistenResized).toHaveBeenCalledOnce();
      expect(win.unlistenFocus).toHaveBeenCalledOnce();
    });

    it('removes listeners that resolve after destruction', async () => {
      TestBed.inject(WindowService);
      TestBed.resetTestingModule();
      await flush();

      expect(win.unlistenResized).toHaveBeenCalledOnce();
      expect(win.unlistenFocus).toHaveBeenCalledOnce();
    });
  });
});
