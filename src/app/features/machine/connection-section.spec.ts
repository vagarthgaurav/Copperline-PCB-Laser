import { TestBed } from '@angular/core/testing';
import { MachineService } from '../../core/machine.service';
import { ConnectionSection } from './connection-section';

describe('ConnectionSection', () => {
  function setup(state: Parameters<MachineService['applyState']>[0] = {}) {
    const machine = TestBed.inject(MachineService);
    machine.applyState(state);
    const fixture = TestBed.createComponent(ConnectionSection);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const button = () => el.querySelector('button') as HTMLButtonElement;
    const select = () => el.querySelector('select') as HTMLSelectElement;
    return { machine, fixture, el, button, select };
  }

  it('disables the select and explains why when there are no ports', () => {
    const { el, select, button } = setup();
    expect(el.querySelector('label')?.textContent).toContain('Serial port');
    expect(select().disabled).toBe(true);
    expect(el.textContent).toContain('No serial ports found. Plug in the machine and reopen this screen.');
    expect(button().textContent).toContain('Connect');
    expect(button().disabled).toBe(true);
    expect(el.querySelector('app-status-chip')?.textContent).toContain('Disconnected');
  });

  it('lists the ports and enables Connect once one is selected', () => {
    const { machine, fixture, el, select, button } = setup({ ports: ['/dev/ttyUSB0', '/dev/ttyUSB1'] });
    expect(select().disabled).toBe(false);
    expect(Array.from(select().options).map((o) => o.textContent?.trim())).toEqual([
      'Choose a port',
      '/dev/ttyUSB0',
      '/dev/ttyUSB1',
    ]);
    expect(el.textContent).not.toContain('No serial ports found');
    expect(button().disabled).toBe(true);

    select().value = '/dev/ttyUSB1';
    select().dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(machine.port()).toBe('/dev/ttyUSB1');
    expect(button().disabled).toBe(false);
  });

  it('calls connect on the service', () => {
    const { machine, button } = setup({ ports: ['/dev/ttyUSB0'], port: '/dev/ttyUSB0' });
    const spy = vi.spyOn(machine, 'connect');
    button().click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('shows the port in the chip and a Disconnect button while connected', () => {
    const { machine, el, select, button } = setup({
      ports: ['/dev/ttyUSB0'],
      port: '/dev/ttyUSB0',
      connection: 'connected',
    });
    const chip = el.querySelector('app-status-chip') as HTMLElement;
    expect(chip.textContent).toContain('Connected');
    expect(chip.textContent).toContain('/dev/ttyUSB0');
    expect(select().disabled).toBe(true);
    expect(button().textContent).toContain('Disconnect');
    expect(button().disabled).toBe(false);

    const spy = vi.spyOn(machine, 'disconnect');
    button().click();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
