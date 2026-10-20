import { TestBed } from '@angular/core/testing';
import { GcodeService } from './gcode.service';

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
});
