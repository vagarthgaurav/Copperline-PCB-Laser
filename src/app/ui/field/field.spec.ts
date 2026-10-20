import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Field, FieldKind, FieldOption, FieldValue } from './field';

@Component({
  imports: [Field],
  template: `
    <app-field
      [kind]="kind()"
      label="Offset X"
      [(value)]="value"
      [unit]="unit()"
      [min]="min()"
      [max]="max()"
      [step]="step()"
      [options]="options()"
      [help]="help()"
      [error]="error()"
      [disabled]="disabled()"
    />
  `,
})
class Host {
  readonly kind = signal<FieldKind>('number');
  readonly value = signal<FieldValue>(12.5);
  readonly unit = signal<string | undefined>('mm');
  readonly min = signal<number | undefined>(undefined);
  readonly max = signal<number | undefined>(undefined);
  readonly step = signal<number | undefined>(undefined);
  readonly options = signal<FieldOption[]>([]);
  readonly help = signal<string | undefined>(undefined);
  readonly error = signal<string | undefined>(undefined);
  readonly disabled = signal(false);
}

describe('Field', () => {
  async function setup(configure?: (host: Host) => void) {
    const fixture = TestBed.createComponent(Host);
    configure?.(fixture.componentInstance);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    return { fixture, host: fixture.componentInstance, root };
  }

  async function type(fixture: { whenStable(): Promise<unknown> }, input: HTMLInputElement, text: string) {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  it('associates the label with the input and announces the unit', async () => {
    const { root } = await setup();
    const label = root.querySelector('label')!;
    const input = root.querySelector('input')!;
    expect(label.htmlFor).toBe(input.id);
    expect(label.textContent).toContain('Offset X');
    expect(label.textContent).toContain('mm');
    expect(input.value).toBe('12.5');
    expect(root.querySelector('.unit')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('links help and error text and marks the input invalid', async () => {
    const { host, root, fixture } = await setup((h) => h.help.set('Applied to every move.'));
    const input = root.querySelector('input')!;
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBe(root.querySelector('.help')!.id);

    host.error.set('Board would leave the peg grid.');
    await fixture.whenStable();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby')!.split(' ');
    expect(describedBy).toContain(root.querySelector('.error-text')!.id);
    expect(root.querySelector('.error-text')!.textContent).toContain('Board would leave');
  });

  it('writes a parsed number, or null while the text is not a number', async () => {
    const { host, root, fixture } = await setup();
    const input = root.querySelector('input')!;
    await type(fixture, input, '48,25');
    expect(host.value()).toBe(48.25);
    await type(fixture, input, '48.0x');
    expect(host.value()).toBeNull();
    expect(input.value).toBe('48.0x');
    await type(fixture, input, '12.');
    expect(host.value()).toBe(12);
    expect(input.value).toBe('12.');
  });

  it('steps a number with the arrow keys within min and max', async () => {
    const { host, root, fixture } = await setup((h) => {
      h.value.set(39.9);
      h.max.set(40);
      h.step.set(0.1);
    });
    const input = root.querySelector('input')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true }));
    await fixture.whenStable();
    expect(host.value()).toBe(40);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true }));
    await fixture.whenStable();
    expect(host.value()).toBe(40);
    expect(input.value).toBe('40.0');
  });

  it('text kind two-way binds a string', async () => {
    const { host, root, fixture } = await setup((h) => {
      h.kind.set('text');
      h.value.set('board');
      h.unit.set(undefined);
    });
    const input = root.querySelector('input')!;
    expect(input.value).toBe('board');
    await type(fixture, input, 'board_v3');
    expect(host.value()).toBe('board_v3');
  });

  it('select picks an option by value', async () => {
    const { host, root, fixture } = await setup((h) => {
      h.kind.set('select');
      h.value.set('a');
      h.options.set([
        { value: 'a', label: '/dev/ttyUSB0' },
        { value: 'b', label: '/dev/ttyACM0' },
      ]);
    });
    const select = root.querySelector('select')!;
    expect(root.querySelector('label')!.htmlFor).toBe(select.id);
    expect(select.value).toBe('a');
    select.value = 'b';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(host.value()).toBe('b');
  });

  it('switch exposes role=switch, aria-checked and toggles', async () => {
    const { host, root, fixture } = await setup((h) => {
      h.kind.set('switch');
      h.value.set(false);
    });
    const sw = root.querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(root.querySelector(`#${sw.getAttribute('aria-labelledby')}`)!.textContent).toBe('Offset X');
    sw.click();
    await fixture.whenStable();
    expect(host.value()).toBe(true);
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });

  it('segmented is a radio group with one tab stop and arrow-key selection', async () => {
    const { host, root, fixture } = await setup((h) => {
      h.kind.set('segmented');
      h.value.set('top');
      h.options.set([
        { value: 'top', label: 'Top' },
        { value: 'bottom', label: 'Bottom' },
      ]);
    });
    const group = root.querySelector('[role="radiogroup"]')!;
    expect(root.querySelector(`#${group.getAttribute('aria-labelledby')}`)!.textContent).toBe('Offset X');
    const radios = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1]);

    radios[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    await fixture.whenStable();
    expect(host.value()).toBe('bottom');
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0]);
    expect(document.activeElement === radios[1] || !radios[1].isConnected).toBeTruthy();

    radios[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    await fixture.whenStable();
    expect(host.value()).toBe('top');
  });

  it('checkbox is a native input inside its label', async () => {
    const { host, root, fixture } = await setup((h) => {
      h.kind.set('checkbox');
      h.value.set(false);
    });
    const box = root.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(box.closest('label')!.textContent).toContain('Offset X');
    box.click();
    await fixture.whenStable();
    expect(host.value()).toBe(true);
  });

  it('slider uses a range input with an output readout', async () => {
    const { host, root, fixture } = await setup((h) => {
      h.kind.set('slider');
      h.value.set(65);
      h.unit.set('%');
    });
    const range = root.querySelector<HTMLInputElement>('input[type="range"]')!;
    const output = root.querySelector('output')!;
    expect(root.querySelector('label')!.htmlFor).toBe(range.id);
    expect(output.getAttribute('for')).toBe(range.id);
    expect(output.textContent).toBe('65%');
    expect(range.getAttribute('aria-valuetext')).toBe('65%');
    await type(fixture, range, '80');
    expect(host.value()).toBe(80);
    expect(output.textContent).toBe('80%');
  });

  it('disables the control', async () => {
    const { root } = await setup((h) => h.disabled.set(true));
    expect(root.querySelector('input')!.disabled).toBe(true);
  });
});
