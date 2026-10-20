import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';
import { GerberService } from '../../core/gerber.service';
import { parsedProject } from '../../core/gerber.fixtures';
import { SimulationLayers } from './simulation-layers';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('SimulationLayers', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
  });
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'];
  });

  it('shows the empty note when no Gerber is loaded', async () => {
    const fixture = TestBed.createComponent(SimulationLayers);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-empty-note')?.textContent).toContain('Layer progress appears');
    expect(el.querySelector('ul')).toBeNull();
  });

  it('lists each layer with a swatch and the Not run status', async () => {
    vi.mocked(invoke).mockResolvedValue(parsedProject());
    const fixture = TestBed.createComponent(SimulationLayers);
    await TestBed.inject(GerberService).load([new File(['x'], 'a.gbr')]);
    await fixture.whenStable();
    const rows = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('li'));
    expect(rows.map((row) => row.querySelector('.name')?.textContent)).toEqual([
      'Top copper',
      'Bottom copper',
      'Outline',
      'Drill',
    ]);
    expect(rows.map((row) => row.querySelector('.swatch')?.getAttribute('data-kind'))).toEqual([
      'copper',
      'copper',
      'outline',
      'drill',
    ]);
    expect(rows.every((row) => row.querySelector('.status')?.textContent === 'Not run')).toBe(true);
  });
});
