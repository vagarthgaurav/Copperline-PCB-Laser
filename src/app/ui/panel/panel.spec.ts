import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Panel } from './panel';
import { PanelSection } from './panel-section';

@Component({
  imports: [Panel, PanelSection],
  template: `
    <app-panel label="Project and placement settings">
      <app-panel-section heading="Project"><p>board_v3.zip</p></app-panel-section>
      <app-panel-section heading="Layers"><button panelActions type="button">Add</button></app-panel-section>
    </app-panel>
  `,
})
class Host {}

describe('Panel', () => {
  it('is a labelled landmark containing named sections', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const panel = el.querySelector('app-panel')!;
    expect(panel.getAttribute('role')).toBe('complementary');
    expect(panel.getAttribute('aria-label')).toBe('Project and placement settings');

    const sections = el.querySelectorAll('section');
    expect(sections.length).toBe(2);
    const h = sections[0].querySelector('h2')!;
    expect(h.textContent).toBe('Project');
    expect(sections[0].getAttribute('aria-labelledby')).toBe(h.id);
    expect(sections[0].textContent).toContain('board_v3.zip');
    expect(sections[1].querySelector('.head button')).toBeTruthy();
  });
});
