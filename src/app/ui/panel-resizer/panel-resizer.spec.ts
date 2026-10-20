import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PanelResizer } from './panel-resizer';

@Component({
  imports: [PanelResizer],
  template: `
    <app-panel-resizer
      [side]="side()"
      label="Resize left panel"
      controls="left-panel"
      [value]="value()"
      [min]="240"
      [max]="560"
      (resized)="onResized($event)"
    />
  `,
})
class Host {
  readonly side = signal<'left' | 'right'>('left');
  readonly value = signal(320);
  readonly emitted: number[] = [];
  onResized(width: number): void {
    this.emitted.push(width);
    this.value.set(width);
  }
}

function pointer(type: string, init: { clientX?: number; button?: number } = {}): Event {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event;
}

describe('PanelResizer', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = (fixture.nativeElement as HTMLElement).querySelector(
      'app-panel-resizer',
    ) as HTMLElement;
    const update = () => fixture.whenStable();
    const key = async (key: string, shiftKey = false) => {
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }),
      );
      await update();
    };
    return { fixture, host: fixture.componentInstance, el, key, update };
  }

  it('is a focusable vertical separator with value, limits, name and controlled panel', async () => {
    const { el } = await setup();
    expect(el.getAttribute('role')).toBe('separator');
    expect(el.getAttribute('aria-orientation')).toBe('vertical');
    expect(el.getAttribute('tabindex')).toBe('0');
    expect(el.getAttribute('aria-label')).toBe('Resize left panel');
    expect(el.getAttribute('aria-controls')).toBe('left-panel');
    expect(el.getAttribute('aria-valuenow')).toBe('320');
    expect(el.getAttribute('aria-valuemin')).toBe('240');
    expect(el.getAttribute('aria-valuemax')).toBe('560');
  });

  it('steps 16 px with the arrows and 64 px with Shift, and updates aria-valuenow', async () => {
    const { host, el, key } = await setup();
    await key('ArrowRight');
    await key('ArrowRight', true);
    await key('ArrowLeft');
    expect(host.emitted).toEqual([336, 400, 384]);
    expect(el.getAttribute('aria-valuenow')).toBe('384');
  });

  it('moves the other way for the right panel', async () => {
    const { host, key, update } = await setup();
    host.side.set('right');
    await update();
    await key('ArrowLeft');
    await key('ArrowRight', true);
    expect(host.emitted).toEqual([336, 272]);
  });

  it('jumps to the limits with Home and End', async () => {
    const { host, key } = await setup();
    await key('Home');
    await key('End');
    expect(host.emitted).toEqual([240, 560]);
  });

  it('does not step past the limits', async () => {
    const { host, key } = await setup();
    await key('End');
    await key('ArrowRight');
    expect(host.emitted).toEqual([560]);
  });

  it('resets to 320 on Enter and on double-click', async () => {
    const { host, el, key, update } = await setup();
    host.value.set(500);
    await update();
    await key('Enter');
    expect(host.emitted).toEqual([320]);
    host.value.set(250);
    await update();
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(host.emitted).toEqual([320, 320]);
  });

  it('ignores other keys', async () => {
    const { host, el, update } = await setup();
    const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    await update();
    expect(host.emitted).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it('drags: the left handle grows its panel with +dx, clamped, relative to the start', async () => {
    const { host, el, update } = await setup();
    el.setPointerCapture = vi.fn();
    el.releasePointerCapture = vi.fn();
    el.dispatchEvent(pointer('pointerdown', { clientX: 100 }));
    await update();
    expect(el.setPointerCapture).toHaveBeenCalledWith(1);
    expect(el.classList.contains('dragging')).toBe(true);

    el.dispatchEvent(pointer('pointermove', { clientX: 140 }));
    el.dispatchEvent(pointer('pointermove', { clientX: 70 }));
    el.dispatchEvent(pointer('pointermove', { clientX: 900 }));
    expect(host.emitted).toEqual([360, 290, 560]);

    el.dispatchEvent(pointer('pointerup', { clientX: 900 }));
    await update();
    expect(el.classList.contains('dragging')).toBe(false);
    el.dispatchEvent(pointer('pointermove', { clientX: 0 }));
    expect(host.emitted).toEqual([360, 290, 560]);
  });

  it('drags: the right handle shrinks its panel with +dx', async () => {
    const { host, el, update } = await setup();
    host.side.set('right');
    await update();
    el.dispatchEvent(pointer('pointerdown', { clientX: 500 }));
    el.dispatchEvent(pointer('pointermove', { clientX: 450 }));
    el.dispatchEvent(pointer('pointermove', { clientX: 530 }));
    expect(host.emitted).toEqual([370, 290]);
  });

  it('shows the keyboard focus indicator only after keyboard use, never after a pointer press', async () => {
    const { el, key, update } = await setup();
    expect(el.hasAttribute('data-keyboard')).toBe(false);

    el.dispatchEvent(new FocusEvent('focus'));
    await update();
    expect(el.hasAttribute('data-keyboard')).toBe(true);

    el.dispatchEvent(pointer('pointerdown', { clientX: 10 }));
    await update();
    expect(el.hasAttribute('data-keyboard')).toBe(false);
    expect(document.activeElement).toBe(el);
    el.dispatchEvent(pointer('pointerup', { clientX: 10 }));
    await update();
    expect(el.hasAttribute('data-keyboard')).toBe(false);

    await key('ArrowRight');
    expect(el.hasAttribute('data-keyboard')).toBe(true);

    el.dispatchEvent(new FocusEvent('blur'));
    await update();
    expect(el.hasAttribute('data-keyboard')).toBe(false);
  });

  it('ignores non-primary buttons', async () => {
    const { host, el } = await setup();
    el.dispatchEvent(pointer('pointerdown', { button: 2 }));
    el.dispatchEvent(pointer('pointermove', { clientX: 50 }));
    expect(host.emitted).toEqual([]);
  });
});
