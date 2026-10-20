import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EmptyNote } from './empty-note';

@Component({ imports: [EmptyNote], template: `<app-empty-note>No Gerber loaded.</app-empty-note>` })
class Host {}

describe('EmptyNote', () => {
  it('renders its projected text in a paragraph', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('p')?.textContent).toBe('No Gerber loaded.');
  });
});
