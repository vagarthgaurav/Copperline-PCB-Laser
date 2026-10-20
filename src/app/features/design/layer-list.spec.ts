import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';
import { GerberService } from '../../core/gerber.service';
import { layer, parsedProject } from '../../core/gerber.fixtures';
import { LayerList } from './layer-list';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const invokeMock = vi.mocked(invoke);

describe('LayerList', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
  });
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'];
  });

  async function setup(project = parsedProject()) {
    invokeMock.mockResolvedValue(project);
    const fixture = TestBed.createComponent(LayerList);
    const gerber = TestBed.inject(GerberService);
    await gerber.load([new File(['x'], 'a.gbr')]);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement, gerber };
  }

  const buttons = (el: HTMLElement) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('button.layer'));

  it('shows the empty note before anything is loaded', async () => {
    const fixture = TestBed.createComponent(LayerList);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-empty-note')?.textContent).toContain('Layers appear');
    expect(el.querySelector('ul')).toBeNull();
  });

  it('renders one button per layer with its label and file name', async () => {
    const { el } = await setup();
    const rows = buttons(el);
    expect(rows.map((b) => b.querySelector('.name')?.textContent)).toEqual([
      'Top copper',
      'Bottom copper',
      'Outline',
      'Drill',
    ]);
    expect(rows[0].querySelector('.file')?.textContent).toBe('board_v3-F_Cu.gbr');
    expect(rows.map((b) => b.querySelector('.swatch')?.getAttribute('data-kind'))).toEqual([
      'copper',
      'copper',
      'outline',
      'drill',
    ]);
    expect(el.querySelector('app-empty-note')).toBeNull();
  });

  it('marks the first layer current and moves aria-current on click', async () => {
    const { fixture, el, gerber } = await setup();
    const current = () => buttons(el).map((b) => b.getAttribute('aria-current'));
    expect(current()).toEqual(['true', null, null, null]);

    buttons(el)[2].click();
    await fixture.whenStable();
    expect(current()).toEqual([null, null, 'true', null]);
    expect(gerber.selectedLayerId()).toBe('board_v3-Edge_Cuts.gbr');
  });

  it('shows the selected layer warnings in a warning banner', async () => {
    const project = parsedProject();
    project.layers[1] = layer({
      id: 'board_v3-B_Cu.gbr',
      kind: 'bottomCopper',
      label: 'Bottom copper',
      warnings: ['Clear polarity is ignored.'],
    });
    const { fixture, el } = await setup(project);
    expect(el.querySelector('app-banner')).toBeNull();

    buttons(el)[1].click();
    await fixture.whenStable();
    const banner = el.querySelector('app-banner')!;
    expect(banner.getAttribute('data-severity')).toBe('warning');
    expect(banner.textContent).toContain(
      'Bottom copper (board_v3-B_Cu.gbr): Clear polarity is ignored.',
    );

    buttons(el)[0].click();
    await fixture.whenStable();
    expect(el.querySelector('app-banner')).toBeNull();
  });

  it('closes the layer warning banner until another layer is selected', async () => {
    const project = parsedProject();
    project.layers[1] = layer({
      id: 'board_v3-B_Cu.gbr',
      kind: 'bottomCopper',
      label: 'Bottom copper',
      warnings: ['Clear polarity is ignored.'],
    });
    const { fixture, el } = await setup(project);

    buttons(el)[1].click();
    await fixture.whenStable();
    el.querySelector<HTMLButtonElement>('app-banner button')!.click();
    await fixture.whenStable();
    expect(el.querySelector('app-banner')).toBeNull();

    buttons(el)[0].click();
    await fixture.whenStable();
    buttons(el)[1].click();
    await fixture.whenStable();
    expect(el.querySelector('app-banner')).not.toBeNull();
  });
});
