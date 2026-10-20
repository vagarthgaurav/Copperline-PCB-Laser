import { Component, ElementRef, inject, input, output, signal } from '@angular/core';

const STEP = 16;
const STEP_LARGE = 64;

/**
 * Thin vertical drag handle between a side panel and the centre. It is a
 * focusable `separator` that reports the new panel width through `resized`;
 * the parent owns the width and feeds it back through `value`.
 *
 * Pointer: drag, where `side` decides the direction (dragging right grows a
 * left panel and shrinks a right one). Keyboard: Left/Right step 16 px
 * (Shift 64 px) in the direction the handle moves, Home/End jump to the
 * limits, Enter or double-click restores `defaultValue`.
 */
@Component({
  selector: 'app-panel-resizer',
  template: ``,
  styleUrl: './panel-resizer.scss',
  host: {
    role: 'separator',
    tabindex: '0',
    'aria-orientation': 'vertical',
    '[attr.aria-label]': 'label()',
    '[attr.aria-controls]': 'controls()',
    '[attr.aria-valuenow]': 'value()',
    '[attr.aria-valuemin]': 'min()',
    '[attr.aria-valuemax]': 'max()',
    '[class.dragging]': 'dragging()',
    '[attr.data-keyboard]': 'keyboard() ? "" : null',
    '(focus)': 'onFocus()',
    '(blur)': 'keyboard.set(false)',
    '(keydown)': 'onKeydown($event)',
    '(dblclick)': 'reset()',
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'endDrag($event)',
    '(pointercancel)': 'endDrag($event)',
  },
})
export class PanelResizer {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Which panel this handle resizes. */
  readonly side = input.required<'left' | 'right'>();
  /** Accessible name, for example "Resize left panel". */
  readonly label = input.required<string>();
  /** Current panel width in px. */
  readonly value = input.required<number>();
  readonly min = input.required<number>();
  readonly max = input.required<number>();
  readonly defaultValue = input(320);
  /** `id` of the panel this handle resizes. */
  readonly controls = input<string>();

  /** The width the user asked for, already limited to `min`..`max`. */
  readonly resized = output<number>();

  protected readonly dragging = signal(false);
  /**
   * True only while keyboard use has focus here; it drives the focus
   * indicator. `:focus-visible` is not trusted because webviews also show it
   * after pointer interaction.
   */
  protected readonly keyboard = signal(false);
  private pointerFocus = false;
  private dragStartX = 0;
  private dragStartValue = 0;

  /** +1 when moving the handle right grows the panel, -1 when it shrinks it. */
  private get direction(): 1 | -1 {
    return this.side() === 'left' ? 1 : -1;
  }

  protected onFocus(): void {
    this.keyboard.set(!this.pointerFocus);
  }

  protected onKeydown(event: KeyboardEvent): void {
    this.keyboard.set(true);
    const step = event.shiftKey ? STEP_LARGE : STEP;
    switch (event.key) {
      case 'ArrowRight':
        this.emit(this.value() + this.direction * step);
        break;
      case 'ArrowLeft':
        this.emit(this.value() - this.direction * step);
        break;
      case 'Home':
        this.emit(this.min());
        break;
      case 'End':
        this.emit(this.max());
        break;
      case 'Enter':
        this.reset();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  protected reset(): void {
    this.emit(this.defaultValue());
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    // Keep the drag from selecting text, but still take focus ourselves.
    event.preventDefault();
    this.keyboard.set(false);
    this.pointerFocus = true;
    this.host.nativeElement.focus();
    this.pointerFocus = false;
    try {
      this.host.nativeElement.setPointerCapture(event.pointerId);
    } catch {
      // Not capturable (for example a synthetic pointer); dragging still works over the handle.
    }
    this.dragStartX = event.clientX;
    this.dragStartValue = this.value();
    this.dragging.set(true);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.dragging()) {
      this.emit(this.dragStartValue + this.direction * (event.clientX - this.dragStartX));
    }
  }

  protected endDrag(event: PointerEvent): void {
    if (!this.dragging()) {
      return;
    }
    this.dragging.set(false);
    try {
      this.host.nativeElement.releasePointerCapture(event.pointerId);
    } catch {
      // Capture was already released.
    }
  }

  private emit(width: number): void {
    const next = Math.min(this.max(), Math.max(this.min(), Math.round(width)));
    if (next !== this.value()) {
      this.resized.emit(next);
    }
  }
}
