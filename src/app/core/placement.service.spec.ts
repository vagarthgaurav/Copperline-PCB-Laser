import { TestBed } from '@angular/core/testing';
import { PlacementService } from './placement.service';

describe('PlacementService', () => {
  const create = () => TestBed.inject(PlacementService);

  it('starts at the origin on the top side, unmirrored', () => {
    const service = create();
    expect(service.offsetX()).toBe(0);
    expect(service.offsetY()).toBe(0);
    expect(service.side()).toBe('top');
    expect(service.mirror()).toBe(false);
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
});
