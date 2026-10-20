import { TestBed } from '@angular/core/testing';
import { GcodeService } from './gcode.service';
import { MachineService } from './machine.service';

const job = (line: number, lines: number) => ({
  name: 'board',
  side: 'Top' as const,
  line,
  lines,
  etaSeconds: 60,
});

describe('MachineService', () => {
  const create = () => TestBed.inject(MachineService);

  it('starts disconnected and idle', () => {
    const service = create();
    expect(service.ports()).toEqual([]);
    expect(service.port()).toBe('');
    expect(service.connection()).toBe('disconnected');
    expect(service.position()).toBeNull();
    expect(service.job()).toBeNull();
    expect(service.consoleLines()).toEqual([]);
    expect(service.jobState()).toBe('idle');
    expect(service.status()).toBe('disconnected');
    expect(service.progress()).toBe(0);
    expect(service.canStart()).toBe(false);
  });

  it('selects a port', () => {
    const service = create();
    service.selectPort('/dev/ttyUSB0');
    expect(service.port()).toBe('/dev/ttyUSB0');
  });

  it('does not fake a connection', () => {
    const service = create();
    service.selectPort('/dev/ttyUSB0');
    service.connect();
    service.start();
    service.pause();
    service.stop();
    service.home();
    service.disconnect();
    expect(service.connection()).toBe('disconnected');
    expect(service.jobState()).toBe('idle');
  });

  it('derives the status', () => {
    const service = create();
    expect(service.status()).toBe('disconnected');
    service.applyState({ connection: 'connected' });
    expect(service.status()).toBe('connected');
    service.applyState({ jobState: 'running' });
    expect(service.status()).toBe('engraving');
    service.applyState({ jobState: 'paused' });
    expect(service.status()).toBe('paused');
    service.applyState({ connection: 'disconnected' });
    expect(service.status()).toBe('disconnected');
  });

  it('derives progress from the job and clamps it', () => {
    const service = create();
    service.applyState({ job: job(25, 100) });
    expect(service.progress()).toBe(0.25);
    service.applyState({ job: job(150, 100) });
    expect(service.progress()).toBe(1);
    service.applyState({ job: job(5, 0) });
    expect(service.progress()).toBe(0);
    service.applyState({ job: null });
    expect(service.progress()).toBe(0);
  });

  it('can start only when connected, idle and there is G-code', () => {
    const service = create();
    const gcode = TestBed.inject(GcodeService);
    service.applyState({ connection: 'connected' });
    expect(service.canStart()).toBe(false);
    gcode.setLines(['G21']);
    expect(service.canStart()).toBe(true);
    service.applyState({ jobState: 'running' });
    expect(service.canStart()).toBe(false);
    service.applyState({ jobState: 'idle', connection: 'disconnected' });
    expect(service.canStart()).toBe(false);
  });

  it('applies partial state and can clear nullable fields', () => {
    const service = create();
    service.applyState({ ports: ['a', 'b'], position: { x: 1, y: 2, z: 3 }, consoleLines: ['ok'] });
    expect(service.ports()).toEqual(['a', 'b']);
    expect(service.position()).toEqual({ x: 1, y: 2, z: 3 });
    expect(service.consoleLines()).toEqual(['ok']);
    service.applyState({ position: null });
    expect(service.position()).toBeNull();
    expect(service.ports()).toEqual(['a', 'b']);
  });
});
