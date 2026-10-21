import { TestBed } from '@angular/core/testing';
import { parsedProject } from './gerber.fixtures';
import { GerberService } from './gerber.service';
import { PegHole } from './gerber.types';
import { PlacementService } from './placement.service';
import {
  applyAffine,
  boardTransform,
  transformedBounds,
} from '../ui/peg-board-viewport/scene-math';
import { floorBounds } from './peg-board';

const BOUNDS = { minX: 126, minY: -114, maxX: 164, maxY: -76 };
const BLANK = { minX: 122, minY: -118, maxX: 168, maxY: -72 };
const HOLES: PegHole[] = [
  { x: 125, y: -75, diameter: 2.2 },
  { x: 125, y: -115, diameter: 2.2 },
  { x: 165, y: -75, diameter: 2.2 },
  { x: 165, y: -115, diameter: 2.2 },
];

describe('PlacementService', () => {
  const create = () => TestBed.inject(PlacementService);

  it('starts at the origin on the top side, unmirrored', () => {
    const service = create();
    expect(service.offsetX()).toBe(0);
    expect(service.offsetY()).toBe(0);
    expect(service.side()).toBe('top');
    expect(service.mirror()).toBe(false);
    expect(service.quarterTurns()).toBe(0);
  });

  it('sets the offset', () => {
    const service = create();
    service.setOffset(12.5, -3);
    expect(service.offsetX()).toBe(12.5);
    expect(service.offsetY()).toBe(-3);
  });

  it('ignores non-finite offsets', () => {
    const service = create();
    service.setOffset(1, 2);
    service.setOffset(Number.NaN, 5);
    service.nudge(Number.POSITIVE_INFINITY, 1);
    expect(service.offsetX()).toBe(1);
    expect(service.offsetY()).toBe(2);
  });

  it('nudges and rounds to 0.01 mm', () => {
    const service = create();
    service.nudge(0.1, 0.2);
    service.nudge(0.2, 0.1);
    expect(service.offsetX()).toBe(0.3);
    expect(service.offsetY()).toBe(0.3);
    service.nudge(0.004, -0.006);
    expect(service.offsetX()).toBe(0.3);
    expect(service.offsetY()).toBe(0.29);
  });

  it('never reports negative zero', () => {
    const service = create();
    service.nudge(-0.001, 0);
    expect(Object.is(service.offsetX(), 0)).toBe(true);
  });

  it('sets side and mirror', () => {
    const service = create();
    service.setSide('bottom');
    service.setMirror(true);
    expect(service.side()).toBe('bottom');
    expect(service.mirror()).toBe(true);
  });

  it('rotates a clockwise quarter turn at a time and wraps', () => {
    const service = create();
    service.rotate();
    expect(service.quarterTurns()).toBe(1);
    service.rotate();
    service.rotate();
    service.rotate();
    expect(service.quarterTurns()).toBe(0);
  });

  it('sets the quarter turns, wrapping into 0..3 and ignoring non-integers', () => {
    const service = create();
    service.setQuarterTurns(2);
    expect(service.quarterTurns()).toBe(2);
    service.setQuarterTurns(-1);
    expect(service.quarterTurns()).toBe(3);
    service.setQuarterTurns(5);
    expect(service.quarterTurns()).toBe(1);
    service.setQuarterTurns(1.5);
    service.setQuarterTurns(Number.NaN);
    expect(service.quarterTurns()).toBe(1);
  });

  describe('peg-grid snapping', () => {
    function load(pegHoles: PegHole[]) {
      const service = create();
      TestBed.inject(GerberService)['_project'].set(
        parsedProject({
          board: { bounds: BOUNDS, source: 'outline', width: 38, height: 38 },
          pegHoles,
        }),
      );
      TestBed.tick();
      return service;
    }

    function expectHolesOnGrid(service: PlacementService) {
      const m = boardTransform(
        BOUNDS,
        service.offsetX(),
        service.offsetY(),
        service.quarterTurns(),
        service.side() === 'bottom',
      );
      for (const hole of HOLES) {
        const p = applyAffine(m, hole.x, hole.y);
        expect(Math.abs(p.x - Math.round(p.x / 10) * 10)).toBeLessThanOrEqual(0.01);
        expect(Math.abs(p.y - Math.round(p.y / 10) * 10)).toBeLessThanOrEqual(0.01);
      }
    }

    it('snaps a requested offset onto the grid and reports the pitch', () => {
      const service = load(HOLES);
      expect(service.snapPitch()).toBe(10);
      service.setOffset(3.3, 4.4);
      expect([service.offsetX(), service.offsetY()]).toEqual([1, 1]);
    });

    it('snaps the current offset when the design loads', () => {
      const service = create();
      service.setOffset(3.3, 4.4);
      expect([service.offsetX(), service.offsetY()]).toEqual([3.3, 4.4]);
      load(HOLES);
      expect([service.offsetX(), service.offsetY()]).toEqual([1, 1]);
    });

    it('keeps every hole on the grid after rotating and flipping', () => {
      const service = load(HOLES);
      service.setOffset(37.77, -12.34);
      expectHolesOnGrid(service);
      for (let i = 0; i < 4; i++) {
        service.rotate();
        expectHolesOnGrid(service);
      }
      service.setQuarterTurns(3);
      expectHolesOnGrid(service);
      service.setSide('bottom');
      expectHolesOnGrid(service);
      service.rotate();
      expectHolesOnGrid(service);
      service.setSide('top');
      expectHolesOnGrid(service);
      expect(service.snapPitch()).toBe(10);
    });

    it('moves one grid step per nudge of one pitch', () => {
      const service = load(HOLES);
      service.setOffset(3.3, 4.4);
      service.nudge(10, 0);
      service.nudge(0, -10);
      expect([service.offsetX(), service.offsetY()]).toEqual([11, -9]);
    });

    it('places freely when the design has no peg holes', () => {
      const service = load([]);
      expect(service.snapPitch()).toBeNull();
      service.setOffset(3.3, 4.4);
      expect([service.offsetX(), service.offsetY()]).toEqual([3.3, 4.4]);
      service.rotate();
      expect([service.offsetX(), service.offsetY()]).toEqual([3.3, 4.4]);
      service.nudge(0.1, 0);
      expect(service.offsetX()).toBe(3.4);
    });

    it('places freely when the hole spacing is off the grid', () => {
      const service = load([
        { x: 125, y: -75, diameter: 2.2 },
        { x: 165.5, y: -75, diameter: 2.2 },
      ]);
      expect(service.snapPitch()).toBeNull();
      service.setOffset(3.3, 4.4);
      expect([service.offsetX(), service.offsetY()]).toEqual([3.3, 4.4]);
    });
  });

  describe('floor limits', () => {
    function load(pegHoles: PegHole[]) {
      const service = create();
      TestBed.inject(GerberService)['_project'].set(
        parsedProject({
          board: { bounds: BOUNDS, source: 'outline', width: 38, height: 38 },
          blank: BLANK,
          pegHoles,
        }),
      );
      TestBed.tick();
      return service;
    }

    function blankBox(service: PlacementService) {
      const m = boardTransform(
        BOUNDS,
        service.offsetX(),
        service.offsetY(),
        service.quarterTurns(),
        service.side() === 'bottom',
      );
      return transformedBounds(BLANK, m);
    }

    function expectOnFloor(service: PlacementService) {
      const box = blankBox(service);
      const floor = floorBounds();
      const eps = 1e-6;
      expect(box.minX).toBeGreaterThanOrEqual(floor.minX - eps);
      expect(box.minY).toBeGreaterThanOrEqual(floor.minY - eps);
      expect(box.maxX).toBeLessThanOrEqual(floor.maxX + eps);
      expect(box.maxY).toBeLessThanOrEqual(floor.maxY + eps);
    }

    function expectHolesOnGrid(service: PlacementService) {
      const m = boardTransform(
        BOUNDS,
        service.offsetX(),
        service.offsetY(),
        service.quarterTurns(),
        service.side() === 'bottom',
      );
      for (const hole of HOLES) {
        const p = applyAffine(m, hole.x, hole.y);
        expect(Math.abs(p.x - Math.round(p.x / 10) * 10)).toBeLessThanOrEqual(0.01);
        expect(Math.abs(p.y - Math.round(p.y / 10) * 10)).toBeLessThanOrEqual(0.01);
      }
    }

    it('pulls a far-away offset inside the floor and onto the grid', () => {
      const service = load(HOLES);
      service.setOffset(-5000, 5000);
      expectOnFloor(service);
      expectHolesOnGrid(service);
      // Blank lower-left is at offset + (-4, -4): lowest x is -16, lowest lattice (10k + 1) is -9.
      expect(service.offsetX()).toBe(-9);
      expect(service.offsetY()).toBe(231);
    });

    it('pulls a far-away offset inside the floor when placing freely', () => {
      const service = load([]);
      service.setOffset(-5000, 5000);
      expect([service.offsetX(), service.offsetY()]).toEqual([-16, 238]);
    });

    it('keeps the board on the floor when nudged against an edge', () => {
      const service = load(HOLES);
      service.setOffset(-5000, 0);
      service.nudge(-10, 0);
      expect(service.offsetX()).toBe(-9);
      expectOnFloor(service);
    });

    it('pulls the board back inside when rotated or flipped at an edge', () => {
      for (const pegHoles of [HOLES, []]) {
        const service = load(pegHoles);
        for (const [x, y] of [
          [-5000, -5000],
          [5000, 5000],
          [-5000, 5000],
          [5000, -5000],
        ]) {
          service.setOffset(x, y);
          for (let i = 0; i < 4; i++) {
            service.rotate();
            expectOnFloor(service);
            service.setSide('bottom');
            expectOnFloor(service);
            service.setSide('top');
            expectOnFloor(service);
          }
          if (pegHoles.length > 0) {
            expectHolesOnGrid(service);
          }
        }
      }
    });

    it('places a loaded design inside the floor', () => {
      const service = create();
      service.setOffset(9000, -9000);
      expect([service.offsetX(), service.offsetY()]).toEqual([9000, -9000]);
      load(HOLES);
      expectOnFloor(service);
      expectHolesOnGrid(service);
    });

    it('leaves the offset unchanged without a project', () => {
      const service = create();
      service.setOffset(9000, -9000);
      service.rotate();
      service.setSide('bottom');
      service.nudge(1, 1);
      expect([service.offsetX(), service.offsetY()]).toEqual([9001, -8999]);
    });
  });
});
