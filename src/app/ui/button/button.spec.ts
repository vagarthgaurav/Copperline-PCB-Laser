import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Button, ButtonVariant } from './button';

@Component({
  imports: [Button],
  template: `
    <button appButton [variant]="variant()" [disabled]="disabled()" (click)="clicks.update(n => n + 1)">Export G-code</button>
    <button appButton iconOnly size="sm" aria-label="Center board">+</button>
  `,
})
class Host {
  readonly variant = signal<ButtonVariant>('primary');
  readonly disabled = signal(false);
  readonly clicks = signal(0);
}

describe('Button', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('button');
    return { fixture, button: buttons[0], iconButton: buttons[1] };
  }

  it('is a native button of type button with a variant and size', async () => {
    const { fixture, button, iconButton } = await setup();
    expect(button.type).toBe('button');
    expect(button.textContent).toContain('Export G-code');
    expect(button.dataset['variant']).toBe('primary');
    expect(button.dataset['size']).toBe('md');

    fixture.componentInstance.variant.set('danger');
    await fixture.whenStable();
    expect(button.dataset['variant']).toBe('danger');

    expect(iconButton.dataset['size']).toBe('sm');
    expect(iconButton.classList).toContain('icon-only');
    expect(iconButton.getAttribute('aria-label')).toBe('Center board');
  });

  it('defaults to the secondary variant', async () => {
    const { iconButton } = await setup();
    expect(iconButton.dataset['variant']).toBe('secondary');
  });

  it('raises click, but not when disabled', async () => {
    const { fixture, button } = await setup();
    button.click();
    expect(fixture.componentInstance.clicks()).toBe(1);

    fixture.componentInstance.disabled.set(true);
    await fixture.whenStable();
    expect(button.disabled).toBe(true);
    button.click();
    expect(fixture.componentInstance.clicks()).toBe(1);
  });
});
