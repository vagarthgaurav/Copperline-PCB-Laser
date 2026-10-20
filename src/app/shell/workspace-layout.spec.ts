import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PanelSection } from '../ui/panel/panel-section';
import { WorkspaceLayout } from './workspace-layout';

@Component({
  imports: [WorkspaceLayout, PanelSection],
  template: `
    <app-workspace-layout leftLabel="Left things" rightLabel="Right things">
      <app-panel-section left heading="Alpha" />
      <app-panel-section left heading="Beta" />
      <p class="centre">Centre content</p>
      <app-panel-section right heading="Gamma" />
    </app-workspace-layout>
  `,
})
class Host {}

describe('WorkspaceLayout', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('projects left, centre and right content into their slots', async () => {
    const el = await setup();
    const [left, right] = Array.from(el.querySelectorAll('app-panel'));
    expect(Array.from(left.querySelectorAll('h2')).map((h) => h.textContent)).toEqual(['Alpha', 'Beta']);
    expect(Array.from(right.querySelectorAll('h2')).map((h) => h.textContent)).toEqual(['Gamma']);
    expect(el.querySelector('main')?.textContent).toContain('Centre content');
    expect(el.querySelector('main')?.querySelector('h2')).toBeNull();
  });

  it('exposes two labelled complementary landmarks and one main', async () => {
    const el = await setup();
    const panels = Array.from(el.querySelectorAll('app-panel'));
    expect(panels.map((p) => p.getAttribute('role'))).toEqual(['complementary', 'complementary']);
    expect(panels.map((p) => p.getAttribute('aria-label'))).toEqual(['Left things', 'Right things']);
    expect(el.querySelectorAll('main').length).toBe(1);
  });

  it('orders left, main, right in the DOM', async () => {
    const el = await setup();
    const tags = Array.from(el.querySelector('app-workspace-layout')!.children).map((c) => c.tagName.toLowerCase());
    expect(tags).toEqual(['app-panel', 'main', 'app-panel']);
  });
});
