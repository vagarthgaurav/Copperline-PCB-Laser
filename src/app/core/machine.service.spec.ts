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

  it('does not fake a connection outside Tauri', async () => {
    const service = create();
    service.selectPort('/dev/ttyUSB0');
    await service.refreshPorts();
    await service.connect();
    await service.send('$I');
    expect(service.ports()).toEqual([]);
    expect(service.consoleLines()).toEqual([]);
    service.start();
    service.pause();
    service.stop();
    service.home();
    await service.disconnect();
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

describe('MachineService serial link', () => {
  const invoke = vi.fn();
  const handlers = new Map<string, (event: { payload: string }) => void>();

  beforeEach(async () => {
    vi.resetModules();
    invoke.mockReset();
    handlers.clear();
    vi.doMock('@tauri-apps/api/core', () => ({ invoke }));
    vi.doMock('@tauri-apps/api/event', () => ({
      listen: async (name: string, handler: (event: { payload: string }) => void) => {
        handlers.set(name, handler);
        return () => handlers.delete(name);
      },
    }));
    (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'];
    vi.doUnmock('@tauri-apps/api/core');
    vi.doUnmock('@tauri-apps/api/event');
  });

  async function create() {
    const { MachineService: Fresh } = await import('./machine.service');
    return TestBed.inject(Fresh);
  }

  it('lists ports and picks the only one', async () => {
    invoke.mockResolvedValue(['/dev/ttyACM0']);
    const service = await create();
    await service.refreshPorts();
    expect(service.ports()).toEqual(['/dev/ttyACM0']);
    expect(service.port()).toBe('/dev/ttyACM0');
  });

  it('connects, logs incoming lines and disconnects', async () => {
    invoke.mockResolvedValue(undefined);
    const service = await create();
    service.selectPort('/dev/ttyACM0');
    await service.connect();
    expect(invoke).toHaveBeenCalledWith('serial_connect', { port: '/dev/ttyACM0', baud: 115200 });
    expect(invoke).toHaveBeenCalledWith('serial_write', { data: '$I\n' });
    expect(service.connection()).toBe('connected');

    handlers.get('serial-line')!({ payload: 'ok' });
    expect(service.consoleLines()).toEqual(['Connected to /dev/ttyACM0', '> $I', 'ok']);

    await service.disconnect();
    expect(invoke).toHaveBeenCalledWith('serial_disconnect');
    expect(service.connection()).toBe('disconnected');
    expect(handlers.size).toBe(0);
  });

  it('reports a failed connect and stays disconnected', async () => {
    invoke.mockRejectedValue('Could not open /dev/ttyACM0: busy');
    const service = await create();
    service.selectPort('/dev/ttyACM0');
    await service.connect();
    expect(service.connection()).toBe('disconnected');
    expect(service.error()).toBe('Could not open /dev/ttyACM0: busy');
    expect(handlers.size).toBe(0);
  });

  it('drops to disconnected when the port is lost', async () => {
    invoke.mockImplementation(async (cmd: string) => (cmd === 'list_serial_ports' ? [] : undefined));
    const service = await create();
    service.selectPort('/dev/ttyACM0');
    await service.connect();
    handlers.get('serial-closed')!({ payload: 'The serial port was lost.' });
    await vi.waitFor(() => expect(service.connection()).toBe('disconnected'));
    expect(service.connection()).toBe('disconnected');
    expect(service.error()).toBe('The serial port was lost.');
  });

  it('shows alarm state, polls, and locks motion until unlocked', async () => {
    invoke.mockImplementation(async (cmd: string) => (cmd === 'list_serial_ports' ? [] : undefined));
    const service = await create();
    service.selectPort('/dev/ttyACM0');
    await service.connect();
    expect(invoke).toHaveBeenCalledWith('serial_write_realtime', { byte: 0x3f });

    handlers.get('serial-line')!({ payload: '<Idle|MPos:1.000,2.000,0.000|FS:0,0>' });
    expect(service.position()).toEqual({ x: 1, y: 2, z: 0 });
    expect(service.canMove()).toBe(true);
    expect(service.consoleLines().some((l) => l.startsWith('<'))).toBe(false);

    handlers.get('serial-line')!({ payload: 'ALARM:10' });
    handlers.get('serial-line')!({ payload: '<Alarm|MPos:1.000,2.000,0.000|FS:0,0>' });
    expect(service.alarm()).toBe(true);
    expect(service.status()).toBe('fault');
    expect(service.alarmText()).toContain('Emergency stop');
    expect(service.canMove()).toBe(false);
    expect(service.canStart()).toBe(false);

    invoke.mockClear();
    service.jog('X', 1);
    service.home();
    expect(invoke).not.toHaveBeenCalled();

    service.unlock();
    expect(invoke).toHaveBeenCalledWith('serial_write', { data: '$X\n' });
    handlers.get('serial-line')!({ payload: '<Idle|MPos:1.000,2.000,0.000|FS:0,0>' });
    expect(service.alarm()).toBe(false);
    await service.disconnect();
  });

  it('emergency stop sends a soft reset and clears the job', async () => {
    invoke.mockImplementation(async (cmd: string) => (cmd === 'list_serial_ports' ? [] : undefined));
    const service = await create();
    service.selectPort('/dev/ttyACM0');
    await service.connect();
    service.applyState({ jobState: 'running' });
    await service.emergencyStop();
    expect(invoke).toHaveBeenCalledWith('serial_write_realtime', { byte: 0x18 });
    expect(service.jobState()).toBe('idle');
    await service.disconnect();
  });
});
