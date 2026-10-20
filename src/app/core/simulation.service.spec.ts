import { TestBed } from '@angular/core/testing';
import { EngravingService } from './engraving.service';
import { GcodeService } from './gcode.service';
import { RAPID_MM_PER_MIN, SimulationService } from './simulation.service';

// 30 mm rapid, then 30 mm each at 600 mm/min (F is modal).
const PROGRAM = ['G21', 'G0 X30', 'G1 X60 F600', 'G1 Y30'];

function setup(lines: readonly string[] = PROGRAM) {
  const gcode = TestBed.inject(GcodeService);
  const engraving = TestBed.inject(EngravingService);
  const sim = TestBed.inject(SimulationService);
  gcode.setLines(lines);
  TestBed.tick();
  return { gcode, engraving, sim };
}

describe('SimulationService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts paused at zero and does not auto-play', () => {
    const { sim } = setup();
    vi.advanceTimersByTime(5000);
    expect(sim.playing()).toBe(false);
    expect(sim.position()).toBe(0);
    expect(sim.speed()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('has zero duration and refuses to play without G-code', () => {
    const { sim, gcode } = setup([]);
    expect(sim.duration()).toBe(0);
    expect(sim.progress()).toBe(0);
    sim.play();
    expect(sim.playing()).toBe(false);
    expect(gcode.currentLine()).toBe(0);
  });

  it('estimates the duration from rapids and the modal F word', () => {
    const { sim } = setup();
    expect(sim.duration()).toBeCloseTo((30 / RAPID_MM_PER_MIN) * 60 + 3 + 3, 6);
  });

  it('falls back to the engraving feed rate when no F word was given', () => {
    const { sim, engraving } = setup(['G1 X30']);
    expect(sim.duration()).toBeCloseTo(1.5, 6);
    engraving.setFeedRate(600);
    expect(sim.duration()).toBeCloseTo(3, 6);
  });

  it('advances by speed times elapsed time while playing', () => {
    const { sim } = setup();
    sim.play();
    vi.advanceTimersByTime(1000);
    expect(sim.position()).toBeCloseTo(1, 6);
    sim.setSpeed(4);
    vi.advanceTimersByTime(500);
    expect(sim.position()).toBeCloseTo(3, 6);
  });

  it('stops advancing when paused and clears the timer', () => {
    const { sim } = setup();
    sim.play();
    vi.advanceTimersByTime(300);
    sim.pause();
    expect(vi.getTimerCount()).toBe(0);
    const at = sim.position();
    vi.advanceTimersByTime(1000);
    expect(sim.position()).toBe(at);
    sim.togglePlaying();
    expect(sim.playing()).toBe(true);
    sim.togglePlaying();
    expect(sim.playing()).toBe(false);
  });

  it('does not create a second timer when play is called twice', () => {
    const { sim } = setup();
    sim.play();
    sim.play();
    expect(vi.getTimerCount()).toBe(1);
  });

  it('clamps and stops at the end', () => {
    const { sim } = setup();
    sim.setSpeed(64);
    sim.play();
    vi.advanceTimersByTime(10_000);
    expect(sim.position()).toBe(sim.duration());
    expect(sim.progress()).toBe(1);
    expect(sim.playing()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('plays again from the start after finishing', () => {
    const { sim } = setup();
    sim.seek(sim.duration());
    sim.play();
    expect(sim.position()).toBe(0);
    expect(sim.playing()).toBe(true);
  });

  it('restarts to zero, paused', () => {
    const { sim } = setup();
    sim.play();
    vi.advanceTimersByTime(1000);
    sim.restart();
    expect(sim.position()).toBe(0);
    expect(sim.playing()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clamps seek to 0..duration', () => {
    const { sim } = setup();
    sim.seek(-4);
    expect(sim.position()).toBe(0);
    sim.seek(1e6);
    expect(sim.position()).toBe(sim.duration());
    sim.seek(2);
    expect(sim.position()).toBe(2);
  });

  it('drives the current G-code line linearly', () => {
    const { sim, gcode } = setup();
    expect(gcode.currentLine()).toBe(1);
    sim.seek(sim.duration());
    TestBed.tick();
    expect(gcode.currentLine()).toBe(4);
    sim.seek(sim.duration() / 2);
    TestBed.tick();
    // 1 + round(0.5 * 3)
    expect(gcode.currentLine()).toBe(3);
  });

  it('follows playback', () => {
    const { sim, gcode } = setup();
    sim.setSpeed(64);
    sim.play();
    vi.advanceTimersByTime(300);
    TestBed.tick();
    expect(gcode.currentLine()).toBeGreaterThan(1);
  });

  it('steps by one line and pauses', () => {
    const { sim, gcode } = setup();
    sim.play();
    sim.stepForward();
    TestBed.tick();
    expect(sim.playing()).toBe(false);
    expect(gcode.currentLine()).toBe(2);
    sim.stepForward();
    sim.stepForward();
    sim.stepForward();
    TestBed.tick();
    expect(gcode.currentLine()).toBe(4);
    sim.stepBack();
    TestBed.tick();
    expect(gcode.currentLine()).toBe(3);
    sim.restart();
    sim.stepBack();
    TestBed.tick();
    expect(gcode.currentLine()).toBe(1);
  });

  it('clears its timer when destroyed', () => {
    const { sim } = setup();
    sim.play();
    expect(vi.getTimerCount()).toBe(1);
    TestBed.resetTestingModule();
    expect(vi.getTimerCount()).toBe(0);
  });
});
