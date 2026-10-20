import { TestBed } from '@angular/core/testing';
import { MachineService } from '../../core/machine.service';
import { PositionSection } from './position-section';

describe('PositionSection', () => {
  function setup(state: Parameters<MachineService['applyState']>[0]) {
    TestBed.inject(MachineService).applyState(state);
    const fixture = TestBed.createComponent(PositionSection);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const values = Array.from(el.querySelectorAll('dd')).map((dd) => dd.textContent?.replace(/\s+/g, ' ').trim());
    return { el, values };
  }

  it('shows X, Y and Z in mm while connected', () => {
    const { el, values } = setup({ connection: 'connected', position: { x: 72.5, y: 95.4, z: 0 } });
    expect(el.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Laser position in millimetres');
    expect(Array.from(el.querySelectorAll('dt')).map((dt) => dt.textContent)).toEqual(['X', 'Y', 'Z']);
    expect(values).toEqual(['072.50 mm', '095.40 mm', '000.00 mm']);
  });

  it('shows em dashes when disconnected, even with a stale position', () => {
    const { values } = setup({ connection: 'disconnected', position: { x: 72.5, y: 95.4, z: 0 } });
    expect(values).toEqual(['— mm', '— mm', '— mm']);
  });

  it('shows em dashes when connected without a position', () => {
    const { values } = setup({ connection: 'connected', position: null });
    expect(values).toEqual(['— mm', '— mm', '— mm']);
  });
});
