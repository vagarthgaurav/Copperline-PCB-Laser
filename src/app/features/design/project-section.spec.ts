import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';
import { GerberService } from '../../core/gerber.service';
import { parsedProject } from '../../core/gerber.fixtures';
import { ProjectSection } from './project-section';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const invokeMock = vi.mocked(invoke);
const file = () => new File(['G04*'], 'a.gbr');

function setTauri(present: boolean) {
  if (present) {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
  } else {
    delete (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'];
  }
}

describe('ProjectSection', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    setTauri(true);
  });
  afterEach(() => setTauri(false));

  async function setup() {
    const fixture = TestBed.createComponent(ProjectSection);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const gerber = TestBed.inject(GerberService);
    return { fixture, el, gerber };
  }

  it('shows the empty note and an Open Gerber button with a hidden multi-file input', async () => {
    const { el } = await setup();
    expect(el.querySelector('app-empty-note')?.textContent).toContain('No Gerber loaded');
    expect(el.querySelector('.filecard')).toBeNull();
    const button = el.querySelector<HTMLButtonElement>('button')!;
    expect(button.textContent).toContain('Open Gerber…');
    const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.multiple).toBe(true);
    expect(input.accept).toContain('.gbr');
    expect(input.accept).toContain('.drl');
    expect(el.querySelector('app-banner')).toBeNull();
  });

  it('clicking the button opens the file picker', async () => {
    const { el } = await setup();
    const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
    const click = vi.spyOn(input, 'click').mockImplementation(() => undefined);
    el.querySelector<HTMLButtonElement>('button')!.click();
    expect(click).toHaveBeenCalledOnce();
  });

  it('loads the picked files and then resets the input', async () => {
    invokeMock.mockResolvedValue(parsedProject());
    const { el, gerber } = await setup();
    const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [file()], configurable: true });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(gerber.project()).not.toBeNull());
    expect(invokeMock).toHaveBeenCalledWith('parse_gerber_files', {
      files: [{ name: 'a.gbr', content: 'G04*' }],
    });
  });

  it('shows the project name, layer count, board size and skipped count once loaded', async () => {
    invokeMock.mockResolvedValue(parsedProject());
    const { fixture, el, gerber } = await setup();
    await gerber.load([file()]);
    await fixture.whenStable();

    expect(el.querySelector('.nm')?.textContent).toBe('board_v3');
    expect(el.querySelector('.filecard')?.textContent).toContain('4 layers · 80 × 55 mm');
    expect(el.querySelector('.filecard')?.textContent).toContain('1 skipped');
    expect(el.querySelector('app-empty-note')).toBeNull();
  });

  it('formats fractional sizes to 0.1 mm and uses the singular for one layer', async () => {
    const project = parsedProject();
    invokeMock.mockResolvedValue(
      parsedProject({
        layers: [project.layers[0]],
        skipped: [],
        board: { ...project.board!, width: 80.04, height: 55.26 },
      }),
    );
    const { fixture, el, gerber } = await setup();
    await gerber.load([file()]);
    await fixture.whenStable();
    expect(el.querySelector('.filecard')?.textContent).toContain('1 layer · 80 × 55.3 mm');
    expect(el.querySelector('app-banner')).toBeNull();
  });

  it('summarises skipped files in one line and names only the unreadable ones', async () => {
    const project = parsedProject();
    project.skipped = [
      { fileName: 'a-F_Mask.gbr', reason: 'Solder mask is not used for engraving' },
      { fileName: 'a-F_Silkscreen.gbr', reason: 'Silkscreen is not used for engraving' },
      { fileName: 'broken.gbr', reason: 'Could not parse: line 3: bad coordinate' },
    ];
    invokeMock.mockResolvedValue(project);
    const { fixture, el, gerber } = await setup();
    await gerber.load([file()]);
    await fixture.whenStable();

    const banner = el.querySelector('app-banner')!;
    expect(banner.getAttribute('data-severity')).toBe('warning');
    expect(banner.textContent).toContain('3 files were skipped (not used for engraving).');
    expect(banner.textContent).toContain('Could not read: broken.gbr.');
    expect(banner.textContent).not.toContain('a-F_Mask.gbr');
  });

  it('shows a single skipped file without naming it', async () => {
    invokeMock.mockResolvedValue(parsedProject());
    const { fixture, el, gerber } = await setup();
    await gerber.load([file()]);
    await fixture.whenStable();

    const banner = el.querySelector('app-banner')!;
    expect(banner.getAttribute('data-severity')).toBe('warning');
    expect(banner.textContent).toContain('1 file was skipped');
    expect(banner.textContent).not.toContain('board_v3-F_Mask.gbr');
  });

  it('closes the skipped-files banner and shows it again for the next project', async () => {
    invokeMock.mockImplementation(async () => parsedProject());
    const { fixture, el, gerber } = await setup();
    await gerber.load([file()]);
    await fixture.whenStable();

    el.querySelector<HTMLButtonElement>('app-banner button')!.click();
    await fixture.whenStable();
    expect(el.querySelector('app-banner')).toBeNull();
    expect(el.querySelector('.filecard')?.textContent).toContain('1 skipped');

    await gerber.load([file()]);
    await fixture.whenStable();
    expect(el.querySelector('app-banner')?.textContent).toContain('1 file was skipped');
  });

  it('shows a loading state while parsing', async () => {
    let resolve: (value: ReturnType<typeof parsedProject>) => void = () => undefined;
    invokeMock.mockReturnValue(new Promise((r) => (resolve = r)));
    const { fixture, el, gerber } = await setup();

    const pending = gerber.load([file()]);
    await fixture.whenStable();
    const button = el.querySelector<HTMLButtonElement>('button')!;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Reading files…');
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Reading');

    resolve(parsedProject());
    await pending;
    await fixture.whenStable();
    expect(el.querySelector<HTMLButtonElement>('button')!.disabled).toBe(false);
    expect(el.querySelector('button')!.textContent).toContain('Open Gerber…');
  });

  it('shows an error banner outside the desktop app and lets the user dismiss it', async () => {
    setTauri(false);
    const { fixture, el, gerber } = await setup();
    await gerber.load([file()]);
    await fixture.whenStable();

    const banner = el.querySelector('app-banner')!;
    expect(banner.getAttribute('role')).toBe('alert');
    expect(banner.textContent).toContain('Gerber parsing needs the desktop app.');

    el.querySelector<HTMLButtonElement>('app-banner button')!.click();
    await fixture.whenStable();
    expect(el.querySelector('app-banner')).toBeNull();
  });

  it('shows an error banner when the command fails', async () => {
    invokeMock.mockRejectedValue('parser crashed');
    const { fixture, el, gerber } = await setup();
    await gerber.load([file()]);
    await fixture.whenStable();
    expect(el.querySelector('app-banner')?.textContent).toContain('parser crashed');
  });
});
