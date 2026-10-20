import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { GcodeService } from '../core/gcode.service';
import { GerberService } from '../core/gerber.service';
import { parsedProject } from '../core/gerber.fixtures';
import { MachineService } from '../core/machine.service';
import { PlacementService } from '../core/placement.service';
import { PegBoardViewport } from '../ui/peg-board-viewport/peg-board-viewport';
import { NO_WEBGL } from '../ui/peg-board-viewport/scene-factory.testing';
import { BoardViewport, ViewportMode } from './board-viewport';

const LINES = ['G0 X0 Y0', 'G1 X10 Y0 F1200', 'G1 X10 Y20'];

describe('BoardViewport', () => {
  let fixture: ComponentFixture<BoardViewport>;

  beforeEach(() => TestBed.configureTestingModule({ providers: [NO_WEBGL] }));

  async function setup(mode: ViewportMode) {
    fixture = TestBed.createComponent(BoardViewport);
    fixture.componentRef.setInput('mode', mode);
    await fixture.whenStable();
    return fixture.debugElement.query(By.directive(PegBoardViewport)).componentInstance as PegBoardViewport;
  }

  it('fills the centre column', async () => {
    await setup('design');
    const style = getComputedStyle(fixture.nativeElement as HTMLElement);
    expect(style.display).toBe('flex');
    expect(style.flexGrow).toBe('1');
  });

  it('shows no geometry until a project is loaded, then builds it for the current side', async () => {
    const viewport = await setup('design');
    expect(viewport.geometry()).toBeNull();

    TestBed.inject(GerberService)['_project'].set(parsedProject());
    await fixture.whenStable();
    expect(viewport.geometry()?.bounds).toEqual({ minX: 0, minY: 0, maxX: 80, maxY: 55 });

    TestBed.inject(PlacementService).setSide('bottom');
    await fixture.whenStable();
    expect(viewport.geometry()?.bounds).toEqual({ minX: 0, minY: 0, maxX: 80, maxY: 55 });
  });

  it('follows the placement', async () => {
    const viewport = await setup('design');
    const placement = TestBed.inject(PlacementService);
    placement.setOffset(12.5, 6);
    placement.setQuarterTurns(3);
    await fixture.whenStable();
    expect(viewport.offsetX()).toBe(12.5);
    expect(viewport.offsetY()).toBe(6);
    expect(viewport.quarterTurns()).toBe(3);
    expect(viewport.mirrored()).toBe(false);
    expect(viewport.side()).toBe('top');

    placement.setSide('bottom');
    await fixture.whenStable();
    expect(viewport.mirrored()).toBe(true);
    expect(viewport.side()).toBe('bottom');
  });

  it('writes edits back to the placement', async () => {
    const viewport = await setup('design');
    const placement = TestBed.inject(PlacementService);
    viewport.offsetChange.emit({ x: 3, y: 4 });
    expect([placement.offsetX(), placement.offsetY()]).toEqual([3, 4]);
    viewport.rotated.emit();
    expect(placement.quarterTurns()).toBe(1);
    viewport.flipped.emit();
    expect(placement.side()).toBe('bottom');
    viewport.flipped.emit();
    expect(placement.side()).toBe('top');
    viewport.side.set('bottom');
    expect(placement.side()).toBe('bottom');
  });

  it('draws the G-code path', async () => {
    const viewport = await setup('design');
    expect(viewport.path()).toEqual([]);
    TestBed.inject(GcodeService).setLines(LINES);
    await fixture.whenStable();
    expect(viewport.path().map((segment) => segment.line)).toEqual([2, 3]);
  });

  describe('design', () => {
    it('is interactive and shows no progress or laser head', async () => {
      const gcode = TestBed.inject(GcodeService);
      gcode.setLines(LINES);
      gcode.setCurrentLine(3);
      const viewport = await setup('design');
      expect(viewport.interactive()).toBe(true);
      expect(viewport.doneLine()).toBe(0);
      expect(viewport.tool()).toBeNull();
    });
  });

  describe('simulate', () => {
    it('is read only and follows the G-code line and position', async () => {
      const gcode = TestBed.inject(GcodeService);
      gcode.setLines(LINES);
      const viewport = await setup('simulate');
      expect(viewport.interactive()).toBe(false);
      expect(viewport.doneLine()).toBe(0);
      expect(viewport.tool()).toBeNull();

      gcode.setCurrentLine(3);
      await fixture.whenStable();
      expect(viewport.doneLine()).toBe(3);
      expect(viewport.tool()).toEqual({ x: 10, y: 20 });
    });
  });

  describe('machine', () => {
    it('is read only and follows the job line and machine position', async () => {
      const machine = TestBed.inject(MachineService);
      const viewport = await setup('machine');
      expect(viewport.interactive()).toBe(false);
      expect(viewport.doneLine()).toBe(0);
      expect(viewport.tool()).toBeNull();

      machine.applyState({
        position: { x: 5, y: 6, z: 0 },
        job: { name: 'board_v3', side: 'Top', line: 42, lines: 100, etaSeconds: 60 },
      });
      await fixture.whenStable();
      expect(viewport.doneLine()).toBe(42);
      expect(viewport.tool()).toEqual({ x: 5, y: 6 });
    });
  });
});
