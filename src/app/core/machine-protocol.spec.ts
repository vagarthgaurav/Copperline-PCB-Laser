import { describeAlarm, parseAlarmCode, parseStatusReport } from './machine-protocol';

describe('parseStatusReport', () => {
  it('reads the state and machine position', () => {
    expect(parseStatusReport('<Idle|MPos:72.500,-95.400,0.000|FS:0,0>')).toEqual({
      state: 'Idle',
      position: { x: 72.5, y: -95.4, z: 0 },
    });
  });

  it('reads a work position and drops the substate', () => {
    expect(parseStatusReport('<Hold:0|WPos:1.000,2.000,3.000>')).toEqual({
      state: 'Hold',
      position: { x: 1, y: 2, z: 3 },
    });
  });

  it('allows a report without a position', () => {
    expect(parseStatusReport('<Alarm>')).toEqual({ state: 'Alarm', position: null });
  });

  it('ignores other lines', () => {
    expect(parseStatusReport('ok')).toBeNull();
    expect(parseStatusReport('ALARM:1')).toBeNull();
  });
});

describe('alarms', () => {
  it('parses alarm lines', () => {
    expect(parseAlarmCode('ALARM:10')).toBe(10);
    expect(parseAlarmCode('ok')).toBeNull();
  });

  it('describes known, unknown and missing codes', () => {
    expect(describeAlarm(10)).toContain('Emergency stop');
    expect(describeAlarm(99)).toBe('Alarm 99.');
    expect(describeAlarm(null)).toBe('The machine is locked.');
  });
});
