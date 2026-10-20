import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MachineStatus, StatusChip } from './status-chip';

@Component({
  imports: [StatusChip],
  template: `<app-status-chip [status]="status()" [label]="label()" [detail]="detail()" />`,
})
class Host {
  readonly status = signal<MachineStatus>('connected');
  readonly label = signal<string | undefined>(undefined);
  readonly detail = signal<string | undefined>(undefined);
}

describe('StatusChip', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const chip = (fixture.nativeElement as HTMLElement).querySelector('app-status-chip')!;
    return { fixture, chip };
  }

  it('is a status region with the default word and a hidden icon', async () => {
    const { chip } = await setup();
    expect(chip.getAttribute('role')).toBe('status');
    expect(chip.textContent).toContain('Connected');
    expect(chip.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('updates the same node when status, label and detail change', async () => {
    const { fixture, chip } = await setup();
    fixture.componentInstance.status.set('engraving');
    fixture.componentInstance.detail.set('42%');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-status-chip')).toBe(chip);
    expect(chip.getAttribute('data-status')).toBe('engraving');
    expect(chip.textContent).toContain('Engraving');
    expect(chip.querySelector('.detail')!.textContent).toBe('42%');

    fixture.componentInstance.label.set('Streaming');
    await fixture.whenStable();
    expect(chip.textContent).toContain('Streaming');
  });
});
