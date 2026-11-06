import { MachinePosition } from './machine.service';

/** What a grblHAL status report (`<Idle|MPos:1.000,2.000,0.000|FS:0,0>`) tells the app. */
export interface StatusReport {
  /** `Idle`, `Run`, `Hold`, `Jog`, `Alarm`, `Door`, `Home`, `Check` or `Sleep`, without a `:n` substate. */
  state: string;
  position: MachinePosition | null;
}

/** Parses a status report line, or returns null when the line is anything else. */
export function parseStatusReport(line: string): StatusReport | null {
  const match = /^<([^|>]+)(?:\|([^>]*))?>$/.exec(line.trim());
  if (match === null) {
    return null;
  }
  const state = match[1].split(':')[0];
  let position: MachinePosition | null = null;
  for (const field of (match[2] ?? '').split('|')) {
    const pos = /^[MW]Pos:(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)/.exec(field);
    if (pos !== null) {
      position = { x: Number(pos[1]), y: Number(pos[2]), z: Number(pos[3]) };
      if (field.startsWith('MPos')) {
        break;
      }
    }
  }
  return { state, position };
}

/** `ALARM:3` gives 3; any other line gives null. */
export function parseAlarmCode(line: string): number | null {
  const match = /^ALARM:(\d+)$/.exec(line.trim());
  return match === null ? null : Number(match[1]);
}

const ALARMS: Record<number, string> = {
  1: 'Hard limit triggered.',
  2: 'Soft limit: the move goes outside the machine travel.',
  3: 'Reset while the machine was moving. Its position may be wrong; home it again.',
  4: 'Probe failed.',
  5: 'Probe failed.',
  6: 'Homing failed: reset during the cycle.',
  7: 'Homing failed: a door opened.',
  8: 'Homing failed: the limit switch did not release.',
  9: 'Homing failed: no limit switch found.',
  10: 'Emergency stop is active.',
  11: 'Homing is required before moving.',
  12: 'A limit switch is engaged.',
};

export function describeAlarm(code: number | null): string {
  return code === null ? 'The machine is locked.' : (ALARMS[code] ?? `Alarm ${code}.`);
}

/** `$130=375.000` gives `{ id: 130, value: '375.000' }`; any other line gives null. A trailing `; comment` is dropped. */
export function parseSettingLine(line: string): { id: number; value: string } | null {
  const match = /^\$(\d+)=([^;\s]*)/.exec(line.trim());
  return match === null ? null : { id: Number(match[1]), value: match[2] };
}

/** `error:8` gives 8; any other line gives null. */
export function parseErrorCode(line: string): number | null {
  const match = /^error:(\d+)$/.exec(line.trim());
  return match === null ? null : Number(match[1]);
}

const ERRORS: Record<number, string> = {
  3: 'The machine does not know this setting.',
  4: 'The machine does not accept a negative value here.',
  8: 'The machine must be idle to change settings.',
  9: 'The machine is locked by an alarm. Unlock it first.',
};

export function describeError(code: number): string {
  return ERRORS[code] ?? `The machine refused it (error ${code}).`;
}
