import {
  Component,
  booleanAttribute,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { tokenizeGcodeLine } from '../../core/gcode-tokens';
import { Button } from '../button/button';
import { Icon } from '../icon/icon';

/** Fixed row height in px; the window maths and the stylesheet both rely on it. */
const ROW_HEIGHT = 22;
/** Rows rendered above and below the visible range. */
const OVERSCAN = 8;
/** Viewport height assumed until the list has been measured (and in tests). */
const FALLBACK_VIEWPORT_HEIGHT = 440;

const numberFormat = new Intl.NumberFormat('en-US');

let nextId = 0;

/**
 * Read-only, line-numbered G-code panel with an Export action and a progress
 * footer. Only the rows in and near the viewport are rendered (fixed 22px
 * rows, spacing above and below via padding), so programs with tens of
 * thousands of lines stay cheap. It follows `currentLine` (centred) whenever
 * that changes; scrolling by hand pauses following until it changes again.
 * Fills the height of its container, so give the parent a flex column.
 */
@Component({
  selector: 'app-gcode-viewer',
  imports: [Button, Icon],
  template: `
    <div class="head">
      <div class="title">
        <h2 class="heading" [id]="headingId">{{ heading() }}</h2>
        <span class="small count">{{ countLabel() }}</span>
      </div>
      @if (showExport()) {
        <button appButton variant="ghost" size="sm" [disabled]="!hasLines()" (click)="exported.emit()">
          <app-icon name="download-simple" [size]="16" />
          Export
        </button>
      }
    </div>

    @if (hasLines()) {
      <ol
        #list
        tabindex="0"
        aria-label="G-code lines"
        [style.padding-top.px]="padTop()"
        [style.padding-bottom.px]="padBottom()"
        [style.--digits]="digits()"
        (scroll)="onScroll()"
      >
        @for (row of rows(); track row.number) {
          <li
            class="gl"
            [class.done]="row.state === 'done'"
            [class.cur]="row.state === 'current'"
            [attr.aria-current]="row.state === 'current' ? 'step' : null"
            [attr.aria-posinset]="row.number"
            [attr.aria-setsize]="total()"
          >
            <span class="n">{{ row.number }}</span>
            <span class="car">
              @if (row.state === 'current') {
                <app-icon name="caret-right" weight="fill" [size]="14" />
              }
            </span>
            <span class="s">
              @for (token of row.tokens; track $index) {
                <span [class.g]="token.kind === 'word'" [class.c]="token.kind === 'comment'">{{ token.text }}</span>
              }
            </span>
          </li>
        }
      </ol>
    } @else {
      <p class="empty small">{{ emptyMessage() }}</p>
    }

    <div class="foot">
      <div
        class="bar"
        role="progressbar"
        aria-label="G-code progress"
        aria-valuemin="0"
        [attr.aria-valuemax]="total()"
        [attr.aria-valuenow]="current()"
      >
        <i [style.width.%]="percent()"></i>
      </div>
      <span class="small">{{ progressLabel() }}</span>
    </div>
  `,
  styleUrl: './gcode-viewer.scss',
  host: {
    role: 'region',
    '[attr.aria-labelledby]': 'headingId',
  },
})
export class GcodeViewer {
  /** The G-code program, one entry per line. */
  readonly lines = input.required<readonly string[]>();
  /** 1-based index of the line being run or simulated; 0 means none. */
  readonly currentLine = input(0);
  /** Hide the Export button (for example on the Machine screen). */
  readonly showExport = input(true, { transform: booleanAttribute });
  readonly heading = input('G-code');
  /** Shown instead of the list when there are no lines. */
  readonly emptyMessage = input('No G-code yet.');
  /** Emitted by the Export button; the parent opens the save dialog. */
  readonly exported = output<void>();

  protected readonly headingId = `gcode-viewer-${nextId++}`;

  private readonly list = viewChild<ElementRef<HTMLOListElement>>('list');
  private readonly scrollTop = signal(0);
  private readonly viewportHeight = signal(FALLBACK_VIEWPORT_HEIGHT);

  protected readonly total = computed(() => this.lines().length);
  protected readonly hasLines = computed(() => this.total() > 0);
  protected readonly current = computed(() =>
    Math.min(Math.max(Math.trunc(this.currentLine()), 0), this.total()),
  );
  protected readonly percent = computed(() =>
    this.total() === 0 ? 0 : Math.round((this.current() / this.total()) * 100),
  );
  protected readonly countLabel = computed(
    () => `${numberFormat.format(this.total())} ${this.total() === 1 ? 'line' : 'lines'}`,
  );
  protected readonly progressLabel = computed(() => {
    if (!this.hasLines()) return 'No lines';
    if (this.current() === 0) return this.showExport() ? 'Ready to export' : 'Not started';
    return `Line ${numberFormat.format(this.current())} of ${numberFormat.format(this.total())} · ${this.percent()}%`;
  });
  /** Gutter width in digits, so six-figure line numbers do not overflow. */
  protected readonly digits = computed(() => Math.max(String(this.total()).length, 4));

  private readonly range = computed(() => {
    const top = this.scrollTop();
    const last = Math.min(
      this.total(),
      Math.ceil((top + this.viewportHeight()) / ROW_HEIGHT) + OVERSCAN,
    );
    const first = Math.min(Math.max(0, Math.floor(top / ROW_HEIGHT) - OVERSCAN), last);
    return { first, last };
  });
  protected readonly padTop = computed(() => this.range().first * ROW_HEIGHT);
  protected readonly padBottom = computed(() => (this.total() - this.range().last) * ROW_HEIGHT);

  protected readonly rows = computed(() => {
    const { first, last } = this.range();
    const lines = this.lines();
    const current = this.current();
    const rows: GcodeRow[] = [];
    for (let i = first; i < last; i++) {
      const number = i + 1;
      rows.push({
        number,
        tokens: tokenizeGcodeLine(lines[i]),
        state: number === current ? 'current' : number < current ? 'done' : 'todo',
      });
    }
    return rows;
  });

  constructor() {
    // Follow the current line. This only re-runs when `currentLine` changes (or
    // the list first appears), so scrolling by hand pauses following until the
    // next line change, as intended.
    effect(() => {
      const list = this.list()?.nativeElement;
      const line = this.current();
      if (!list || line === 0) return;
      untracked(() => {
        const top = Math.max(0, (line - 1) * ROW_HEIGHT - (this.viewportHeight() - ROW_HEIGHT) / 2);
        list.scrollTop = top;
        this.scrollTop.set(top);
      });
    });

    // Measure the viewport so the window covers the real height.
    effect((onCleanup) => {
      const list = this.list()?.nativeElement;
      if (!list || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => {
        if (list.clientHeight > 0) this.viewportHeight.set(list.clientHeight);
      });
      observer.observe(list);
      onCleanup(() => observer.disconnect());
    });
  }

  protected onScroll(): void {
    const list = this.list()?.nativeElement;
    if (list) this.scrollTop.set(list.scrollTop);
  }
}

interface GcodeRow {
  readonly number: number;
  readonly tokens: ReturnType<typeof tokenizeGcodeLine>;
  readonly state: 'done' | 'current' | 'todo';
}
