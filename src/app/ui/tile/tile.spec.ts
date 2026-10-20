import { TestBed } from '@angular/core/testing';
import { Tile } from './tile';

describe('Tile', () => {
  it('renders a label and a value as a description list', async () => {
    const fixture = TestBed.createComponent(Tile);
    fixture.componentRef.setInput('label', 'X');
    fixture.componentRef.setInput('value', '147.10');
    fixture.componentRef.setInput('unit', 'mm');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('dt')!.textContent).toBe('X');
    expect(el.querySelector('dd')!.textContent).toContain('147.10');
    expect(el.querySelector('dd .unit')!.textContent).toBe('mm');
  });

  it('omits the unit when none is given', async () => {
    const fixture = TestBed.createComponent(Tile);
    fixture.componentRef.setInput('label', 'Lines');
    fixture.componentRef.setInput('value', 1284);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.unit')).toBeNull();
  });
});
