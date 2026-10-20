import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GcodeViewer } from './gcode-viewer';

@Component({
  imports: [GcodeViewer],
  template: `
    <app-gcode-viewer
      [lines]="lines()"
      [currentLine]="currentLine()"
      [showExport]="showExport()"
      (exported)="exports.update((n) => n + 1)"
    />
  `,
})
class Host {
  readonly lines = signal<readonly string[]>([]);
  readonly currentLine = signal(0);
  readonly showExport = signal(true);
  readonly exports = signal(0);
}

function program(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `G1 X${i}.000 Y${i}.500`);
}

describe('GcodeViewer', () => {
  async function setup(lines: readonly string[], currentLine = 0) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.lines.set(lines);
    fixture.componentInstance.currentLine.set(currentLine);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      host: fixture.componentInstance,
      el,
      rows: () => Array.from(el.querySelectorAll<HTMLElement>('li')),
      text: (selector: string) => el.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim(),
    };
  }

  it('shows the heading and a formatted line count', async () => {
    const { el, text } = await setup(program(1284));
    expect(text('h2')).toBe('G-code');
    expect(text('.count')).toBe('1,284 lines');
    expect(el.querySelector('app-gcode-viewer')!.getAttribute('role')).toBe('region');
  });

  it('uses the singular for one line', async () => {
    const { text } = await setup(['M5']);
    expect(text('.count')).toBe('1 line');
  });

  it('marks the current line with aria-current, a caret and the cur class', async () => {
    const { rows } = await setup(program(30), 12);
    const current = rows().filter((r) => r.getAttribute('aria-current') === 'step');
    expect(current.length).toBe(1);
    expect(current[0].classList.contains('cur')).toBe(true);
    expect(current[0].querySelector('.n')!.textContent).toBe('12');
    expect(current[0].querySelector('.car svg')).toBeTruthy();
    expect(rows().filter((r) => r.querySelector('.car svg')).length).toBe(1);
  });

  it('tones executed lines and leaves upcoming ones plain', async () => {
    const { rows } = await setup(program(30), 12);
    const byNumber = (n: number) => rows().find((r) => r.querySelector('.n')!.textContent === String(n))!;
    expect(byNumber(11).classList.contains('done')).toBe(true);
    expect(byNumber(1).classList.contains('done')).toBe(true);
    expect(byNumber(13).classList.contains('done')).toBe(false);
    expect(byNumber(13).classList.contains('cur')).toBe(false);
    expect(byNumber(13).hasAttribute('aria-current')).toBe(false);
  });

  it('wraps G/M words and comments in their own spans and keeps the line text', async () => {
    const { rows } = await setup(['G1 X1.000 ; cut', 'M5']);
    const first = rows()[0].querySelector('.s')!;
    expect(first.textContent).toBe('G1 X1.000 ; cut');
    expect(first.querySelector('.g')!.textContent).toBe('G1');
    expect(first.querySelector('.c')!.textContent).toBe('; cut');
    expect(rows()[1].querySelector('.s .g')!.textContent).toBe('M5');
  });

  it('shows the empty message instead of the list, and disables Export', async () => {
    const { el, text } = await setup([]);
    expect(el.querySelector('ol')).toBeNull();
    expect(text('.empty')).toBe('No G-code yet.');
    expect(text('.count')).toBe('0 lines');
    expect(el.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);
  });

  it('emits exported when Export is clicked, and hides it when showExport is false', async () => {
    const { fixture, host, el } = await setup(program(5));
    el.querySelector<HTMLButtonElement>('button')!.click();
    expect(host.exports()).toBe(1);

    host.showExport.set(false);
    await fixture.whenStable();
    expect(el.querySelector('button')).toBeNull();
  });

  it('reports progress numerically and through the progressbar', async () => {
    const { fixture, host, el, text } = await setup(program(1284), 412);
    const bar = el.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute('aria-label')).toBe('G-code progress');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('1284');
    expect(bar.getAttribute('aria-valuenow')).toBe('412');
    expect(text('.foot .small')).toBe('Line 412 of 1,284 · 32%');
    expect(el.querySelector<HTMLElement>('.bar > i')!.style.width).toBe('32%');

    host.currentLine.set(5000);
    await fixture.whenStable();
    expect(bar.getAttribute('aria-valuenow')).toBe('1284');
    expect(text('.foot .small')).toBe('Line 1,284 of 1,284 · 100%');
  });

  it('says what is pending before the first line', async () => {
    const { fixture, host, text } = await setup(program(10), 0);
    expect(text('.foot .small')).toBe('Ready to export');
    host.showExport.set(false);
    await fixture.whenStable();
    expect(text('.foot .small')).toBe('Not started');
  });

  it('renders a window of rows, not every line, for a long program', async () => {
    const { el, rows } = await setup(program(10_000));
    expect(rows().length).toBeGreaterThan(10);
    expect(rows().length).toBeLessThan(100);
    const list = el.querySelector<HTMLElement>('ol')!;
    expect(list.getAttribute('tabindex')).toBe('0');
    expect(list.getAttribute('aria-label')).toBe('G-code lines');
    expect(rows()[0].getAttribute('aria-setsize')).toBe('10000');
    // The unrendered rows are accounted for by padding so the scrollbar is right.
    const rendered = rows().length;
    expect(parseInt(list.style.paddingBottom, 10)).toBe((10_000 - rendered) * 22);
  });

  it('follows the current line, centred, and renders the rows around it', async () => {
    const { fixture, host, el, rows } = await setup(program(10_000), 5000);
    const list = el.querySelector<HTMLElement>('ol')!;
    expect(list.scrollTop).toBe(4999 * 22 - (440 - 22) / 2);
    expect(rows().length).toBeLessThan(100);
    expect(rows().some((r) => r.getAttribute('aria-current') === 'step')).toBe(true);

    host.currentLine.set(5001);
    await fixture.whenStable();
    expect(list.scrollTop).toBe(5000 * 22 - (440 - 22) / 2);
    expect(rows().some((r) => r.querySelector('.n')!.textContent === '5001' && r.classList.contains('cur'))).toBe(true);
  });

  it('stops following after a manual scroll until the current line changes', async () => {
    const { fixture, host, el, rows } = await setup(program(10_000), 5000);
    const list = el.querySelector<HTMLElement>('ol')!;

    list.scrollTop = 220;
    list.dispatchEvent(new Event('scroll'));
    await fixture.whenStable();
    expect(list.scrollTop).toBe(220);
    expect(rows()[0].querySelector('.n')!.textContent).toBe('3');
    expect(rows().some((r) => r.getAttribute('aria-current') === 'step')).toBe(false);

    host.currentLine.set(5002);
    await fixture.whenStable();
    expect(list.scrollTop).toBe(5001 * 22 - (440 - 22) / 2);
  });
});
