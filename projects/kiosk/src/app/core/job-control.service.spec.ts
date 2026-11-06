import { TestBed } from '@angular/core/testing';
import { GerberService } from '@app/core/gerber.service';
import { ParsedProject } from '@app/core/gerber.types';
import { MachineService } from '@app/core/machine.service';
import { JobControl } from './job-control.service';

const project: ParsedProject = {
  name: 'demo',
  layers: [],
  skipped: [],
  board: { bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 }, source: 'copper', width: 10, height: 10 },
  blank: null,
  pegHoles: [],
};

describe('JobControl', () => {
  function setup() {
    const jobs = TestBed.inject(JobControl);
    const machine = TestBed.inject(MachineService);
    const gerber = TestBed.inject(GerberService) as unknown as { _project: { set(p: ParsedProject): void } };
    return { jobs, machine, loadBoard: () => gerber._project.set(project) };
  }

  it('says what is missing before Start can be used', () => {
    const { jobs, machine, loadBoard } = setup();
    expect(jobs.canStart()).toBe(false);
    expect(jobs.startBlocker()).toContain('USB');
    loadBoard();
    expect(jobs.startBlocker()).toContain('not connected');
    machine.applyState({ connection: 'connected' });
    expect(jobs.startBlocker()).toBeNull();
    expect(jobs.canStart()).toBe(true);
  });

  it('only asks to confirm when Start is possible', () => {
    const { jobs, machine, loadBoard } = setup();
    jobs.requestStart();
    expect(jobs.confirming()).toBe(false);
    loadBoard();
    machine.applyState({ connection: 'connected' });
    jobs.requestStart();
    expect(jobs.confirming()).toBe(true);
    jobs.cancel();
    expect(jobs.confirming()).toBe(false);
  });

  it('reports a failed G-code generation instead of starting', async () => {
    const { jobs, machine, loadBoard } = setup();
    loadBoard();
    machine.applyState({ connection: 'connected' });
    jobs.requestStart();
    await jobs.confirmStart();
    expect(jobs.error()).toBeTruthy();
    expect(machine.jobState()).toBe('idle');
    expect(jobs.confirming()).toBe(false);
  });

  it('can stop only while a job is active', () => {
    const { jobs, machine } = setup();
    expect(jobs.canStop()).toBe(false);
    machine.applyState({ jobState: 'running' });
    expect(jobs.canStop()).toBe(true);
    machine.applyState({ jobState: 'paused' });
    expect(jobs.canStop()).toBe(true);
  });
});
