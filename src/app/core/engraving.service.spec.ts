import { TestBed } from '@angular/core/testing';
import { EngravingService } from './engraving.service';

describe('EngravingService', () => {
  const create = () => TestBed.inject(EngravingService);

  it('defaults to 65 % and 1200 mm/min', () => {
    const service = create();
    expect(service.power()).toBe(65);
    expect(service.feedRate()).toBe(1200);
    expect(service.spotDiameter()).toBe(0.1);
    expect(service.isolationPasses()).toBe(1);
    expect(service.passOverlap()).toBe(0.3);
  });

  it('clamps power to 0..100', () => {
    const service = create();
    service.setPower(150);
    expect(service.power()).toBe(100);
    service.setPower(-5);
    expect(service.power()).toBe(0);
    service.setPower(42.5);
    expect(service.power()).toBe(42.5);
  });

  it('clamps the feed rate to at least 1', () => {
    const service = create();
    service.setFeedRate(0);
    expect(service.feedRate()).toBe(1);
    service.setFeedRate(-10);
    expect(service.feedRate()).toBe(1);
    service.setFeedRate(3000);
    expect(service.feedRate()).toBe(3000);
  });

  it('ignores NaN', () => {
    const service = create();
    service.setPower(Number.NaN);
    service.setFeedRate(Number.NaN);
    service.setSpotDiameter(Number.NaN);
    service.setIsolationPasses(Number.POSITIVE_INFINITY);
    service.setPassOverlap(Number.NaN);
    expect(service.power()).toBe(65);
    expect(service.feedRate()).toBe(1200);
    expect(service.spotDiameter()).toBe(0.1);
    expect(service.isolationPasses()).toBe(1);
    expect(service.passOverlap()).toBe(0.3);
  });

  it('clamps the spot diameter to 0.01..1 mm', () => {
    const service = create();
    service.setSpotDiameter(0);
    expect(service.spotDiameter()).toBe(0.01);
    service.setSpotDiameter(5);
    expect(service.spotDiameter()).toBe(1);
    service.setSpotDiameter(0.08);
    expect(service.spotDiameter()).toBe(0.08);
  });

  it('keeps isolation passes a whole number from 1 to 20', () => {
    const service = create();
    service.setIsolationPasses(0);
    expect(service.isolationPasses()).toBe(1);
    service.setIsolationPasses(99);
    expect(service.isolationPasses()).toBe(20);
    service.setIsolationPasses(3.4);
    expect(service.isolationPasses()).toBe(3);
  });

  it('clamps the pass overlap to 0..0.9', () => {
    const service = create();
    service.setPassOverlap(-0.2);
    expect(service.passOverlap()).toBe(0);
    service.setPassOverlap(1);
    expect(service.passOverlap()).toBe(0.9);
    service.setPassOverlap(0.5);
    expect(service.passOverlap()).toBe(0.5);
  });
});
