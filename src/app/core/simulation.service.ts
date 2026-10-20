import { DestroyRef, Service, computed, effect, inject, signal } from '@angular/core';
import { EngravingService } from './engraving.service';
import { traceGcode } from './gcode-path';
import { GcodeService } from './gcode.service';

export type SimulationSpeed = 1 | 4 | 16 | 64;

/**
 * Assumed travel speed of G0 rapids, in mm/min, for the duration estimate.
 * Placeholder until the machine's real rapid rate is configurable.
 */
export const RAPID_MM_PER_MIN = 3000;

const TICK_MS = 100;

/**
 * Playback of the G-code simulation. `position` is in seconds along an
 * estimated timeline; `GcodeService.currentLine` follows it so the viewer
 * highlights the matching line. Never starts by itself.
 */
@Service()
export class SimulationService {
  private readonly gcode = inject(GcodeService);
  private readonly engraving = inject(EngravingService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _playing = signal(false);
  private readonly _speed = signal<SimulationSpeed>(1);
  private readonly _position = signal(0);

  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;

  readonly playing = this._playing.asReadonly();
  readonly speed = this._speed.asReadonly();
  /** Seconds into the job. */
  readonly position = this._position.asReadonly();

  /**
   * Estimated job time in seconds: G1 length / feed (the F word, else the
   * engraving feed rate) plus G0 length at {@link RAPID_MM_PER_MIN}.
   */
  readonly duration = computed(() => {
    const lines = this.gcode.lines();
    if (lines.length === 0) {
      return 0;
    }
    const fallbackFeed = this.engraving.feedRate();
    let minutes = 0;
    for (const move of traceGcode(lines).moves) {
      if (move.kind === 'rapid') {
        minutes += move.length / RAPID_MM_PER_MIN;
      } else {
        const feed = move.feed !== null && move.feed > 0 ? move.feed : fallbackFeed;
        minutes += move.length / feed;
      }
    }
    return minutes * 60;
  });

  /** 0..1 through the job. */
  readonly progress = computed(() => {
    const duration = this.duration();
    return duration > 0 ? Math.min(1, Math.max(0, this._position() / duration)) : 0;
  });

  /**
   * The ONE place that maps simulation progress to a G-code line (1-based,
   * 0 = none). This is a linear approximation: it assumes every line takes
   * the same time. Replace it with a real timeline once the generator
   * provides per-line timings.
   */
  private readonly line = computed(() => {
    const count = this.gcode.lineCount();
    if (count === 0) {
      return 0;
    }
    return Math.min(count, Math.max(1, 1 + Math.round(this.progress() * (count - 1))));
  });

  constructor() {
    // Keeps the viewer on the line that matches the playback position.
    effect(() => this.gcode.setCurrentLine(this.line()));
    this.destroyRef.onDestroy(() => this.stopTimer());
  }

  play(): void {
    const duration = this.duration();
    if (duration <= 0 || this._playing()) {
      return;
    }
    if (this._position() >= duration) {
      this._position.set(0);
    }
    this._playing.set(true);
    this.lastTick = Date.now();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  pause(): void {
    this._playing.set(false);
    this.stopTimer();
  }

  togglePlaying(): void {
    if (this._playing()) {
      this.pause();
    } else {
      this.play();
    }
  }

  /** Back to the start, paused. */
  restart(): void {
    this.pause();
    this._position.set(0);
  }

  /** Pauses and moves to the next G-code line. */
  stepForward(): void {
    this.stepBy(1);
  }

  /** Pauses and moves to the previous G-code line. */
  stepBack(): void {
    this.stepBy(-1);
  }

  seek(seconds: number): void {
    if (Number.isFinite(seconds)) {
      this._position.set(Math.min(this.duration(), Math.max(0, seconds)));
    }
  }

  setSpeed(speed: SimulationSpeed): void {
    this._speed.set(speed);
  }

  private stepBy(delta: number): void {
    this.pause();
    const count = this.gcode.lineCount();
    if (count < 2) {
      return;
    }
    // Inverse of `line`: the progress at which a line becomes current.
    const target = Math.min(count, Math.max(1, this.line() + delta));
    this.seek(((target - 1) / (count - 1)) * this.duration());
  }

  private tick(): void {
    const now = Date.now();
    const elapsed = (now - this.lastTick) / 1000;
    this.lastTick = now;
    const duration = this.duration();
    const next = this._position() + elapsed * this._speed();
    if (next >= duration) {
      this._position.set(duration);
      this.pause();
    } else {
      this._position.set(next);
    }
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
