import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Banner, BannerSeverity } from './banner';

@Component({
  imports: [Banner],
  template: `
    <app-banner [severity]="severity()" message="Board overhangs the peg grid by 2.5 mm" dismissible (dismissed)="count.update(n => n + 1)">
      <button type="button" class="action">Center board</button>
    </app-banner>
  `,
})
class Host {
  readonly severity = signal<BannerSeverity>('warning');
  readonly count = signal(0);
}

describe('Banner', () => {
  it('uses status for warnings and alert for errors, with the severity in words', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = (fixture.nativeElement as HTMLElement).querySelector('app-banner')!;
    expect(el.getAttribute('role')).toBe('status');
    expect(el.textContent).toContain('Warning');
    expect(el.textContent).toContain('Board overhangs the peg grid by 2.5 mm');
    expect(el.querySelector('.action')).toBeTruthy();

    fixture.componentInstance.severity.set('error');
    await fixture.whenStable();
    expect(el.getAttribute('role')).toBe('alert');
    expect(el.textContent).toContain('Error');
  });

  it('emits dismissed from a labelled dismiss button', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const btn = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button[aria-label]')!;
    expect(btn.getAttribute('aria-label')).toBe('Dismiss warning');
    btn.click();
    expect(fixture.componentInstance.count()).toBe(1);
  });
});
