import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';
import { EngravingService } from './engraving.service';
import { GcodeService } from './gcode.service';
import { GcodeOutput } from './gcode.types';
import { parsedProject } from './gerber.fixtures';
import { GerberService } from './gerber.service';
import { ParsedProject } from './gerber.types';
import { PlacementService } from './placement.service';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const invokeMock = vi.mocked(invoke);

function setTauri(present: boolean) {
  if (present) {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
  } else {
    delete (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'];
  }
}

function output(lines: string[] = ['G21', 'G1 X1']): GcodeOutput {
  return {
    lines,
    stats: {
      contourCount: 2,
      engraveLengthMm: 10,
      rapidLengthMm: 5,
      estimatedSeconds: 3,
      bounds: { minX: 0, minY: 0, maxX: 80, maxY: 55 },
    },
    warnings: ['careful'],
  };
}

const PROGRAM = ['; header', 'G21', 'G0 X1 Y2', 'M3 S650', 'G1 X5 F1200', 'Y6 ; up', 'M5'];

function create(): GcodeService {
  return TestBed.inject(GcodeService);
}

describe('GcodeService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('starts empty', () => {
    const service = create();
    expect(service.lines()).toEqual([]);
    expect(service.lineCount()).toBe(0);
    expect(service.currentLine()).toBe(0);
    expect(service.currentPosition()).toBeNull();
  });

  it('counts the lines it is given', () => {
    const service = create();
    service.setLines(PROGRAM);
    expect(service.lineCount()).toBe(7);
  });

  it('clamps the current line to the program', () => {
    const service = create();
    service.setLines(PROGRAM);
    service.setCurrentLine(99);
    expect(service.currentLine()).toBe(7);
    service.setCurrentLine(-3);
    expect(service.currentLine()).toBe(0);
    service.setCurrentLine(4);
    service.setLines(['G1 X1']);
    expect(service.currentLine()).toBe(1);
  });

  it('finds the position modally', () => {
    const service = create();
    service.setLines(PROGRAM);
    expect(service.positionAt(0)).toBeNull();
    expect(service.positionAt(2)).toBeNull();
    expect(service.positionAt(3)).toEqual({ x: 1, y: 2 });
    expect(service.positionAt(4)).toEqual({ x: 1, y: 2 });
    expect(service.positionAt(5)).toEqual({ x: 5, y: 2 });
    expect(service.positionAt(6)).toEqual({ x: 5, y: 6 });
    expect(service.positionAt(100)).toEqual({ x: 5, y: 6 });
  });

  it('follows the current line with currentPosition', () => {
    const service = create();
    service.setLines(PROGRAM);
    service.setCurrentLine(5);
    expect(service.currentPosition()).toEqual({ x: 5, y: 2 });
  });

  describe('exportToFile', () => {
    beforeEach(() => {
      Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    });

    it('does nothing without lines', () => {
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      create().exportToFile();
      expect(click).not.toHaveBeenCalled();
    });

    it('downloads the lines joined by newlines', async () => {
      let download = '';
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        download = this.download;
      });
      const service = create();
      service.setLines(['G21', 'G1 X1']);
      service.exportToFile();
      expect(download).toBe('copperline.gcode');
      const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
      expect(await blob.text()).toBe('G21\nG1 X1');
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
      expect(document.querySelector('a[download]')).toBeNull();
    });

    it('uses the given file name', () => {
      let download = '';
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        download = this.download;
      });
      const service = create();
      service.setLines(['G21']);
      service.exportToFile('board.nc');
      expect(download).toBe('board.nc');
    });
  });

  describe('generate', () => {
    const project = signal<ParsedProject | null>(null);

    function setup(loaded = true) {
      project.set(loaded ? parsedProject() : null);
      TestBed.configureTestingModule({
        providers: [{ provide: GerberService, useValue: { project } }],
      });
      return {
        service: TestBed.inject(GcodeService),
        placement: TestBed.inject(PlacementService),
        engraving: TestBed.inject(EngravingService),
      };
    }

    beforeEach(() => {
      invokeMock.mockReset();
      setTauri(true);
    });
    afterEach(() => setTauri(false));

    it('sends the placement and laser settings and stores the result', async () => {
      invokeMock.mockResolvedValue(output());
      const { service, placement, engraving } = setup();
      placement.setSide('bottom');
      placement.setOffset(12.5, -3);
      placement.setQuarterTurns(3);
      engraving.setPower(40);
      engraving.setFeedRate(900);
      engraving.setSpotDiameter(0.05);
      engraving.setIsolationPasses(2);
      engraving.setPassOverlap(0.5);

      const pending = service.generate();
      expect(service.generating()).toBe(true);
      await pending;

      expect(invokeMock).toHaveBeenCalledWith('generate_gcode', {
        request: {
          dialect: 'grblHal',
          side: 'bottom',
          placement: { offsetX: 12.5, offsetY: -3, quarterTurns: 3 },
          powerPercent: 40,
          feedRate: 900,
          spotDiameter: 0.05,
          isolationPasses: 2,
          passOverlap: 0.5,
          spindleMax: 1000,
        },
      });
      expect(service.generating()).toBe(false);
      expect(service.error()).toBeNull();
      expect(service.lines()).toEqual(['G21', 'G1 X1']);
      expect(service.stats()?.contourCount).toBe(2);
      expect(service.warnings()).toEqual(['careful']);
    });

    it('sends the top side by default', async () => {
      invokeMock.mockResolvedValue(output());
      const { service } = setup();
      await service.generate();
      const request = invokeMock.mock.calls[0][1] as { request: { side: string } };
      expect(request.request.side).toBe('top');
    });

    it('reports a rejection, clears the lines and stats, and clears the error on the next success', async () => {
      invokeMock.mockResolvedValueOnce(output());
      const { service } = setup();
      await service.generate();

      invokeMock.mockRejectedValueOnce('No bottom copper layer in this project');
      await service.generate();
      expect(service.error()).toBe('No bottom copper layer in this project');
      expect(service.lines()).toEqual([]);
      expect(service.stats()).toBeNull();
      expect(service.warnings()).toEqual([]);
      expect(service.generating()).toBe(false);

      invokeMock.mockResolvedValueOnce(output(['G21']));
      await service.generate();
      expect(service.error()).toBeNull();
      expect(service.lines()).toEqual(['G21']);
    });

    it('describes an Error rejection by its message', async () => {
      invokeMock.mockRejectedValue(new Error('boom'));
      const { service } = setup();
      await service.generate();
      expect(service.error()).toBe('boom');
    });

    it('ignores a stale response when a newer call has started', async () => {
      let resolveFirst: (value: GcodeOutput) => void = () => {};
      invokeMock.mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)));
      invokeMock.mockResolvedValueOnce(output(['new']));
      const { service } = setup();

      const first = service.generate();
      await service.generate();
      resolveFirst(output(['old']));
      await first;

      expect(service.lines()).toEqual(['new']);
      expect(service.generating()).toBe(false);
    });

    it('ignores a stale rejection too', async () => {
      let rejectFirst: (reason: string) => void = () => {};
      invokeMock.mockReturnValueOnce(new Promise((_, reject) => (rejectFirst = reject)));
      invokeMock.mockResolvedValueOnce(output(['new']));
      const { service } = setup();

      const first = service.generate();
      await service.generate();
      rejectFirst('late failure');
      await first;

      expect(service.error()).toBeNull();
      expect(service.lines()).toEqual(['new']);
    });

    it('does not call Rust without a project and clears generated lines', async () => {
      invokeMock.mockResolvedValue(output());
      const { service } = setup();
      await service.generate();
      expect(service.lineCount()).toBe(2);

      project.set(null);
      await service.generate();
      expect(invokeMock).toHaveBeenCalledTimes(1);
      expect(service.lines()).toEqual([]);
      expect(service.stats()).toBeNull();
      expect(service.error()).toBeNull();
    });

    it('leaves lines from setLines alone when there is no project', async () => {
      const { service } = setup(false);
      service.setLines(['G21']);
      await service.generate();
      expect(service.lines()).toEqual(['G21']);
      expect(invokeMock).not.toHaveBeenCalled();
    });

    it('does nothing and sets no error outside Tauri', async () => {
      setTauri(false);
      const { service } = setup();
      await service.generate();
      expect(invokeMock).not.toHaveBeenCalled();
      expect(service.error()).toBeNull();
      expect(service.generating()).toBe(false);
    });

    describe('stale', () => {
      it('is false initially and after generating', async () => {
        invokeMock.mockResolvedValue(output());
        const { service } = setup();
        expect(service.stale()).toBe(false);
        await service.generate();
        expect(service.stale()).toBe(false);
      });

      it.each([
        ['power', (p: PlacementService, e: EngravingService) => e.setPower(10)],
        ['offset', (p: PlacementService) => p.setOffset(5, 1)],
        ['side', (p: PlacementService) => p.setSide('bottom')],
      ])('is true after the %s changes and false after regenerating', async (_name, change) => {
        invokeMock.mockResolvedValue(output());
        const { service, placement, engraving } = setup();
        await service.generate();
        change(placement, engraving);
        expect(service.stale()).toBe(true);
        await service.generate();
        expect(service.stale()).toBe(false);
      });

      it('is true when the project is replaced and false without generated lines', async () => {
        invokeMock.mockResolvedValue(output());
        const { service } = setup();
        await service.generate();
        project.set(parsedProject());
        expect(service.stale()).toBe(true);
        service.setLines([]);
        expect(service.stale()).toBe(false);
      });
    });
  });
});
