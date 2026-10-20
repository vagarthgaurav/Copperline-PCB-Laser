import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { GcodeService } from '../../core/gcode.service';
import { MachineService } from '../../core/machine.service';
import { MachinePage } from './machine-page';

describe('MachinePage', () => {
  async function setup() {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'machine', component: MachinePage }])] });
    const harness = await RouterTestingHarness.create('/machine');
    return { harness, el: harness.routeNativeElement as HTMLElement };
  }

  it('renders the panel headings with empty states', async () => {
    const { el } = await setup();
    const [left, right] = Array.from(el.querySelectorAll('app-panel'));
    const headings = (panel: Element) => Array.from(panel.querySelectorAll('h2')).map((h) => h.textContent?.trim());
    expect(headings(left)).toEqual(['Connection', 'Position', 'Job', 'Console']);
    expect(headings(right)).toEqual(['Current move', 'G-code']);
    expect(left.textContent).toContain('No serial ports found. Plug in the machine and reopen this screen.');
    expect(left.textContent).toContain('No job running. Load a Gerber in Design to prepare one.');
    expect(left.textContent).toContain('No machine output yet.');
    expect(right.textContent).toContain('Nothing streaming. Start a job to see live G-code.');
  });

  it('labels the panels and puts the viewport placeholder and job bar in main', async () => {
    const { el } = await setup();
    const labels = Array.from(el.querySelectorAll('app-panel')).map((p) => p.getAttribute('aria-label'));
    expect(labels).toEqual(['Machine status', 'Live G-code']);
    const main = el.querySelector('main') as HTMLElement;
    expect(main.textContent).toContain('3D viewport');
    expect(main.querySelector('app-job-bar')).not.toBeNull();
    const children = Array.from(main.children).map((c) => c.tagName.toLowerCase());
    expect(children.indexOf('app-viewport-placeholder')).toBeLessThan(children.indexOf('app-job-bar'));
  });

  it('shows dashes for the position and current move when nothing is known', async () => {
    const { el } = await setup();
    const values = Array.from(el.querySelectorAll('app-tile dd')).map((dd) => dd.textContent?.replace(/\s+/g, ' ').trim());
    expect(values).toEqual(['— mm', '— mm', '— mm', '— mm', '— mm']);
  });

  it('shows the current move from the G-code service', async () => {
    const { harness, el } = await setup();
    const gcode = TestBed.inject(GcodeService);
    gcode.setLines(['G0 X0 Y0', 'G1 X72.5 Y95.4']);
    gcode.setCurrentLine(2);
    harness.detectChanges();
    const group = el.querySelector('[aria-label="Current move in millimetres"]') as HTMLElement;
    expect(Array.from(group.querySelectorAll('dd')).map((dd) => dd.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      '072.50 mm',
      '095.40 mm',
    ]);
    expect(el.querySelectorAll('app-gcode-viewer li').length).toBeGreaterThan(0);
  });

  it('shows the live machine state', async () => {
    const { harness, el } = await setup();
    TestBed.inject(MachineService).applyState({
      connection: 'connected',
      port: '/dev/ttyUSB0',
      ports: ['/dev/ttyUSB0'],
      position: { x: 1, y: 2, z: 0 },
    });
    harness.detectChanges();
    expect(el.textContent).toContain('Connected');
    expect(el.textContent).toContain('001.00 mm');
  });
});
