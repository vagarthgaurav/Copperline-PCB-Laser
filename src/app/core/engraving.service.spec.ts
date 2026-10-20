import { TestBed } from '@angular/core/testing';
import { EngravingService } from './engraving.service';

describe('EngravingService', () => {
  const create = () => TestBed.inject(EngravingService);

  it('defaults to 65 % and 1200 mm/min', () => {
    const service = create();
    expect(service.power()).toBe(65);
    expect(service.feedRate()).toBe(1200);
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
    expect(service.power()).toBe(65);
    expect(service.feedRate()).toBe(1200);
  });
});
