import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';
import { parsedProject } from './gerber.fixtures';
import { GerberService, NEEDS_DESKTOP_MESSAGE } from './gerber.service';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const invokeMock = vi.mocked(invoke);

function setTauri(present: boolean) {
  if (present) {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
  } else {
    delete (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'];
  }
}

const files = () => [new File(['G04 top*'], 'a-F_Cu.gbr'), new File(['M48'], 'a.drl')];

describe('GerberService', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    setTauri(true);
  });
  afterEach(() => setTauri(false));

  it('starts empty', () => {
    const service = TestBed.inject(GerberService);
    expect(service.project()).toBeNull();
    expect(service.loading()).toBe(false);
    expect(service.error()).toBeNull();
    expect(service.selectedLayerId()).toBeNull();
    expect(service.selectedLayer()).toBeNull();
    expect(service.board()).toBeNull();
  });

  it('sends file names and text to parse_gerber_files and stores the result', async () => {
    const result = parsedProject();
    invokeMock.mockResolvedValue(result);
    const service = TestBed.inject(GerberService);

    const pending = service.load(files());
    expect(service.loading()).toBe(true);
    await pending;

    expect(invokeMock).toHaveBeenCalledWith('parse_gerber_files', {
      files: [
        { name: 'a-F_Cu.gbr', content: 'G04 top*' },
        { name: 'a.drl', content: 'M48' },
      ],
    });
    expect(service.loading()).toBe(false);
    expect(service.error()).toBeNull();
    expect(service.project()).toEqual(result);
    expect(service.board()).toEqual(result.board);
  });

  it('selects the first layer by default and follows selectLayer', async () => {
    invokeMock.mockResolvedValue(parsedProject());
    const service = TestBed.inject(GerberService);
    await service.load(files());

    expect(service.selectedLayerId()).toBe('board_v3-F_Cu.gbr');
    expect(service.selectedLayer()?.kind).toBe('topCopper');

    service.selectLayer('board_v3.drl');
    expect(service.selectedLayer()?.kind).toBe('drill');

    service.selectLayer('missing.gbr');
    expect(service.selectedLayerId()).toBe('board_v3.drl');
  });

  it('resets the selection to the first layer when a new project loads', async () => {
    invokeMock.mockResolvedValue(parsedProject());
    const service = TestBed.inject(GerberService);
    await service.load(files());
    service.selectLayer('board_v3.drl');

    invokeMock.mockResolvedValue(parsedProject({ name: 'other' }));
    await service.load(files());
    expect(service.selectedLayerId()).toBe('board_v3-F_Cu.gbr');
  });

  it('sets an error with the detail when invoke rejects and keeps the previous project', async () => {
    const service = TestBed.inject(GerberService);
    invokeMock.mockResolvedValueOnce(parsedProject());
    await service.load(files());

    invokeMock.mockRejectedValueOnce('parser crashed');
    await service.load(files());

    expect(service.error()).toBe('Could not load the Gerber files: parser crashed');
    expect(service.loading()).toBe(false);
    expect(service.project()?.name).toBe('board_v3');
  });

  it('reports an Error rejection by its message', async () => {
    invokeMock.mockRejectedValue(new Error('boom'));
    const service = TestBed.inject(GerberService);
    await service.load(files());
    expect(service.error()).toBe('Could not load the Gerber files: boom');
  });

  it('shows an error listing the reasons when nothing usable came back', async () => {
    invokeMock.mockResolvedValue(
      parsedProject({
        layers: [],
        board: null,
        skipped: [{ fileName: 'a.gts', reason: 'Solder mask is not used for engraving' }],
      }),
    );
    const service = TestBed.inject(GerberService);
    await service.load(files());

    expect(service.project()).toBeNull();
    expect(service.error()).toBe(
      'No usable Gerber or drill files found. a.gts: Solder mask is not used for engraving.',
    );
  });

  it('clears an earlier error when the next load starts', async () => {
    const service = TestBed.inject(GerberService);
    invokeMock.mockRejectedValueOnce('nope');
    await service.load(files());
    expect(service.error()).not.toBeNull();

    invokeMock.mockResolvedValueOnce(parsedProject());
    await service.load(files());
    expect(service.error()).toBeNull();
  });

  it('can dismiss the error', async () => {
    invokeMock.mockRejectedValue('nope');
    const service = TestBed.inject(GerberService);
    await service.load(files());
    service.clearError();
    expect(service.error()).toBeNull();
  });

  it('ignores an empty selection', async () => {
    const service = TestBed.inject(GerberService);
    await service.load([]);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(service.error()).toBeNull();
  });

  it('asks for the desktop app outside Tauri without calling invoke', async () => {
    setTauri(false);
    const service = TestBed.inject(GerberService);
    await service.load(files());

    expect(invokeMock).not.toHaveBeenCalled();
    expect(service.error()).toBe(NEEDS_DESKTOP_MESSAGE);
    expect(service.error()).toBe('Gerber parsing needs the desktop app.');
    expect(service.loading()).toBe(false);
  });

  it('keeps only the latest of two overlapping loads', async () => {
    const service = TestBed.inject(GerberService);
    let resolveFirst: (value: ReturnType<typeof parsedProject>) => void = () => undefined;
    invokeMock.mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)));
    invokeMock.mockResolvedValueOnce(parsedProject({ name: 'second' }));

    const first = service.load(files());
    await service.load(files());
    resolveFirst(parsedProject({ name: 'first' }));
    await first;

    expect(service.project()?.name).toBe('second');
    expect(service.loading()).toBe(false);
  });
});
