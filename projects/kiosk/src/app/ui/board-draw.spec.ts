import { floorBounds } from '@app/core/peg-board';
import { BoardGeometry } from '@app/ui/peg-board-viewport/scene.types';
import { dragToMm, fitFloor, fromCanvas, hitsWithin, placedGrabBounds, toCanvas } from './board-draw';

describe('fitFloor', () => {
  const floor = floorBounds();
  const w = floor.maxX - floor.minX;
  const h = floor.maxY - floor.minY;

  it('fits a wide canvas by height and centres the floor sideways', () => {
    const view = fitFloor(1000, h, floor);
    expect(view.scale).toBeCloseTo(1);
    expect(view.top).toBeCloseTo(0);
    expect(view.left).toBeCloseTo((1000 - w) / 2);
  });

  it('fits a tall canvas by width', () => {
    const view = fitFloor(w / 2, 1000, floor);
    expect(view.scale).toBeCloseTo(0.5);
    expect(view.left).toBeCloseTo(0);
  });

  it('never returns a zero or negative scale', () => {
    expect(fitFloor(0, 0).scale).toBeGreaterThan(0);
  });
});

describe('toCanvas and dragToMm', () => {
  const view = { scale: 2, left: 10, top: 20 };
  const floor = floorBounds();

  it('puts +Y up the screen', () => {
    const low = toCanvas(view, 0, 0, floor);
    const high = toCanvas(view, 0, 30, floor);
    expect(high.y).toBeLessThan(low.y);
    expect(low.x).toBeCloseTo(10 + (0 - floor.minX) * 2);
  });

  it('maps a pixel back to the same millimetres', () => {
    const p = toCanvas(view, 42, 17, floor);
    const back = fromCanvas(view, p.x, p.y, floor);
    expect(back.x).toBeCloseTo(42);
    expect(back.y).toBeCloseTo(17);
  });

  it('turns a drag down and right into +X and -Y', () => {
    expect(dragToMm(view, 20, 10)).toEqual({ dx: 10, dy: -5 });
  });
});

describe('grab area', () => {
  const geometry: BoardGeometry = {
    bounds: { minX: 0, minY: 0, maxX: 40, maxY: 20 },
    copper: new Float32Array(),
    outline: [],
    holes: [],
    blank: null,
    pegHoles: [],
  };

  it('follows the offset and the rotation', () => {
    expect(placedGrabBounds(geometry, 15, 30, 0, false)).toEqual({ minX: 15, minY: 30, maxX: 55, maxY: 50 });
    const turned = placedGrabBounds(geometry, 15, 30, 1, false);
    expect(turned.maxX - turned.minX).toBeCloseTo(20);
    expect(turned.maxY - turned.minY).toBeCloseTo(40);
    expect(turned.minX).toBeCloseTo(15);
  });

  it('accepts a touch slightly outside the board', () => {
    const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(hitsWithin(bounds, 12, 5, 3)).toBe(true);
    expect(hitsWithin(bounds, 14, 5, 3)).toBe(false);
  });
});
