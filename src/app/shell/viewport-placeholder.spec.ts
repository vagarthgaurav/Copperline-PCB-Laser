import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ViewportPlaceholder } from './viewport-placeholder';

@Component({ imports: [ViewportPlaceholder], template: `<app-viewport-placeholder>The board appears here.</app-viewport-placeholder>` })
class Host {}

describe('ViewportPlaceholder', () => {
  it('renders its projected text', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('p')?.textContent).toBe('The board appears here.');
  });
});
