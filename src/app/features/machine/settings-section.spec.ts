import { TestBed } from '@angular/core/testing';
import { MachineService } from '../../core/machine.service';
import { SettingsSection } from './settings-section';

describe('SettingsSection', () => {
  function setup(settings: Record<number, string> | null) {
    const machine = TestBed.inject(MachineService);
    machine.applyState({ connection: 'connected' });
    if (settings !== null) {
      (machine as unknown as { _settings: { set(v: Record<number, string>): void } })._settings.set(settings);
    }
    const write = vi.spyOn(machine, 'writeSetting').mockResolvedValue(true);
    const fixture = TestBed.createComponent(SettingsSection);
    fixture.detectChanges();
    return { machine, write, fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('asks to connect while disconnected', () => {
    const fixture = TestBed.createComponent(SettingsSection);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Connect to the machine to read its settings.');
  });

  it('explains every setting the machine reports', () => {
    const { el } = setup({ 32: '1', 100: '80.4', 999: '5' });
    const text = el.textContent ?? '';
    expect(text).toContain('$32 · Mode of operation');
    expect(text).toContain('Laser mode keeps the power in step');
    expect(text).toContain('$100 · X steps per mm');
    expect(text).toContain('$999 · Setting $999');
  });

  const button = (el: HTMLElement, text: string) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement;

  function type(fixture: { detectChanges(): void }, input: HTMLInputElement, text: string) {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('keeps Submit disabled until something changes, and sends nothing on edit', () => {
    const { write, fixture, el } = setup({ 130: '375.000' });
    expect(button(el, 'Submit changes').disabled).toBe(true);
    type(fixture, el.querySelector('input[inputmode="decimal"]') as HTMLInputElement, '370');
    expect(button(el, 'Submit changes (1)').disabled).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it('lists every change in the dialog and writes them only after Confirm', async () => {
    const { write, fixture, el } = setup({ 3: '3', 130: '375.000' });
    type(fixture, el.querySelector('input[inputmode="decimal"]') as HTMLInputElement, '370');
    (el.querySelectorAll('input[type="checkbox"]')[2] as HTMLInputElement).click();
    fixture.detectChanges();
    button(el, 'Submit changes (2)').click();
    fixture.detectChanges();
    const dialog = el.querySelector('app-confirm-dialog') as HTMLElement;
    const text = dialog.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(text).toContain('$3 · Step direction invert');
    expect(text).toContain('3→7');
    expect(text).toContain('Z: on');
    expect(text).toContain('$130 · X max travel');
    expect(text).toContain('375 mm→370 mm');
    expect(write).not.toHaveBeenCalled();
    button(dialog, 'Save 2 settings').click();
    await fixture.whenStable();
    expect(write.mock.calls).toEqual([
      [3, '7'],
      [130, '370'],
    ]);
  });

  it('writes nothing when the dialog is cancelled', () => {
    const { write, fixture, el } = setup({ 130: '375.000' });
    type(fixture, el.querySelector('input[inputmode="decimal"]') as HTMLInputElement, '370');
    button(el, 'Submit changes (1)').click();
    fixture.detectChanges();
    button(el.querySelector('app-confirm-dialog') as HTMLElement, 'Cancel').click();
    fixture.detectChanges();
    expect(write).not.toHaveBeenCalled();
    expect(button(el, 'Submit changes (1)').disabled).toBe(false);
  });

  it('drops a change that is typed back to the machine value', () => {
    const { fixture, el } = setup({ 130: '375.000' });
    const input = el.querySelector('input[inputmode="decimal"]') as HTMLInputElement;
    type(fixture, input, '370');
    type(fixture, input, '375');
    expect(button(el, 'Submit changes').disabled).toBe(true);
  });

  it('filters by search text', () => {
    const { fixture, el } = setup({ 32: '1', 100: '80.4' });
    const search = el.querySelector('input[placeholder]') as HTMLInputElement;
    search.value = 'steps';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el.textContent).toContain('$100');
    expect(el.textContent).not.toContain('$32 ·');
  });
});
