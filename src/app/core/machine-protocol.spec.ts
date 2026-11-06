import { describeAlarm, describeError, parseAlarmCode, parseErrorCode, parseSettingLine, parseStatusReport } from './machine-protocol';

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

describe('settings lines', () => {
  it('parses a setting and drops a comment', () => {
    expect(parseSettingLine('$130=375.000')).toEqual({ id: 130, value: '375.000' });
    expect(parseSettingLine('$0=5.0          ; Step pulse length')).toEqual({ id: 0, value: '5.0' });
    expect(parseSettingLine('ok')).toBeNull();
    expect(parseSettingLine('$I')).toBeNull();
  });

  it('parses errors', () => {
    expect(parseErrorCode('error:8')).toBe(8);
    expect(parseErrorCode('ok')).toBeNull();
    expect(describeError(8)).toContain('idle');
    expect(describeError(99)).toContain('99');
  });
});
