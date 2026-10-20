import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Icon } from './icon';
import { ICONS } from './icons';

@Component({
  imports: [Icon],
  template: `<app-icon name="play" /><app-icon name="moon" [size]="16" weight="fill" />`,
})
class Host {}

describe('Icon', () => {
  it('renders a decorative 20px svg by default', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('viewBox')).toBe('0 0 256 256');
    expect(svg.getAttribute('fill')).toBe('currentColor');
    expect(svg.getAttribute('width')).toBe('20');
    expect(svg.querySelector('path')!.getAttribute('d')).toBe(ICONS.play.regular);
  });

  it('honours size and fill weight', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const svg = (fixture.nativeElement as HTMLElement).querySelectorAll('svg')[1];
    expect(svg.getAttribute('width')).toBe('16');
    expect(svg.querySelector('path')!.getAttribute('d')).toBe(ICONS.moon.fill);
  });

  it('has path data for every required icon', () => {
    for (const name of [
      'sun', 'moon', 'minus', 'square', 'copy', 'x', 'download-simple', 'folder-open',
      'flip-horizontal', 'play', 'pause', 'stop', 'house', 'plug', 'check-circle', 'warning',
      'cube', 'upload-simple', 'eye', 'eye-slash', 'caret-right', 'sliders-horizontal',
      'arrow-right', 'terminal-window', 'link',
    ]) {
      expect(ICONS[name as keyof typeof ICONS].regular.length).toBeGreaterThan(10);
    }
  });
});
