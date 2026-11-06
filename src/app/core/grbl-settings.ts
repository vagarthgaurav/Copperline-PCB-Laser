/** How a setting is edited. `mask` is a row of checkboxes over the bits of an integer. */
export type SettingKind = 'number' | 'switch' | 'select' | 'mask';

export interface SettingChoice {
  readonly value: number;
  readonly label: string;
}

export interface SettingDef {
  readonly id: number;
  readonly name: string;
  readonly group: string;
  readonly kind: SettingKind;
  readonly unit?: string;
  readonly min?: number;
  readonly step?: number;
  readonly choices?: readonly SettingChoice[];
  /** Bit labels for `mask`, keyed by bit number. Bits without a label are kept as they are. */
  readonly bits?: Readonly<Record<number, string>>;
  readonly description: string;
}

/** Group order in the Settings tab. */
export const SETTING_GROUPS = [
  'Stepper signals',
  'Motion and reporting',
  'Inputs and outputs',
  'Limits',
  'Homing',
  'Laser',
  'Axes',
  'Motor drivers',
  'Sensorless homing',
  'Parking',
  'Tool change',
  'Behaviour',
] as const;

const AXES: Readonly<Record<number, string>> = { 0: 'X', 1: 'Y', 2: 'Z' };
const AXIS_NOTE = 'Each axis is one bit: X = 1, Y = 2, Z = 4.';
const PORTS: Readonly<Record<number, string>> = {
  0: 'Port 0',
  1: 'Port 1',
  2: 'Port 2',
  3: 'Port 3',
  4: 'Port 4',
  5: 'Port 5',
  6: 'Port 6',
  7: 'Port 7',
};
const CONTROLS: Readonly<Record<number, string>> = {
  0: 'Reset',
  1: 'Feed hold',
  2: 'Cycle start',
  3: 'Safety door',
};

interface NumberExtra {
  unit?: string;
  min?: number;
  step?: number;
}

function num(id: number, group: string, name: string, description: string, extra: NumberExtra = {}): SettingDef {
  return { id, name, group, kind: 'number', description, min: 0, ...extra };
}

function mask(
  id: number,
  group: string,
  name: string,
  description: string,
  bits: Readonly<Record<number, string>>,
): SettingDef {
  return { id, name, group, kind: 'mask', description, bits };
}

function pick(
  id: number,
  group: string,
  name: string,
  description: string,
  choices: readonly SettingChoice[],
): SettingDef {
  return { id, name, group, kind: 'select', description, choices };
}

function flag(id: number, group: string, name: string, description: string): SettingDef {
  return { id, name, group, kind: 'switch', description };
}

/** One setting per axis, ids `base`, `base + 1`, ... */
function perAxis(
  base: number,
  group: string,
  title: string,
  description: string,
  extra: NumberExtra,
  axes = 3,
): SettingDef[] {
  return Array.from({ length: axes }, (_, axis) =>
    num(base + axis, group, `${AXES[axis]} ${title}`, description, extra),
  );
}

const S = 'Stepper signals';
const M = 'Motion and reporting';
const IO = 'Inputs and outputs';
const L = 'Limits';
const H = 'Homing';
const LA = 'Laser';
const AX = 'Axes';
const D = 'Motor drivers';
const SH = 'Sensorless homing';
const P = 'Parking';
const T = 'Tool change';
const B = 'Behaviour';

/** Every setting the app can explain. The machine decides which of them exist; others show up as "Setting $n". */
export const SETTINGS: readonly SettingDef[] = [
  num(0, S, 'Step pulse length', 'Length of the pulse sent to a stepper driver for each step. Most drivers need at least 2 µs; longer pulses are safer but cap the top speed.', { unit: 'µs', step: 0.5 }),
  num(1, S, 'Step idle delay', 'How long the motors stay energized after a move ends, so they hold position while the machine settles. 255 keeps them energized all the time.', { unit: 'ms', step: 5 }),
  mask(2, S, 'Step pulse invert', 'Flips the step signal of an axis. Leave it at 0 unless the driver expects an active-low step pulse.', AXES),
  mask(3, S, 'Step direction invert', `Reverses the direction of an axis motor. Use it when an axis moves the wrong way, and check Homing direction invert afterwards, because the home side may change. ${AXIS_NOTE}`, AXES),
  mask(4, S, 'Stepper enable invert', 'Flips the enable output of the stepper drivers. Most drivers, TMC2209 included, are enabled by a low signal, which needs this set.', AXES),
  mask(37, S, 'Keep steppers enabled', 'Axes whose motors stay energized when the machine is idle. 0 lets all of them de-energize after the idle delay.', AXES),
  num(29, S, 'Step pulse delay', 'Delay between setting the direction signal and sending the step pulse. Raise it only when a driver misses steps after a direction change.', { unit: 'µs', step: 0.5 }),
  num(680, S, 'Stepper enable delay', 'Time to wait after switching the motors on before the first step is sent.', { unit: 'ms', step: 1 }),

  mask(10, M, 'Status report options', 'What the machine adds to its "?" status reports. Copperline needs "Machine position" to show where the laser is. More data means longer reports.', {
    0: 'Machine position',
    1: 'Buffer state',
    2: 'Line numbers',
    3: 'Feed and speed',
    4: 'Pin state',
    5: 'Work coordinate offset',
    6: 'Overrides',
    7: 'Probe coordinates',
    8: 'Buffer sync on offset change',
    9: 'Parser state',
    10: 'Alarm substate',
    11: 'Run substate',
    12: 'Report while homing',
  }),
  num(11, M, 'Junction deviation', 'How fast the machine may take a corner. A higher value is faster through corners but shakes the machine more; a lower value slows down for every corner.', { unit: 'mm', step: 0.001 }),
  num(12, M, 'Arc tolerance', 'How closely arcs (G2, G3) are cut into short straight lines. A smaller value gives smoother arcs and more segments.', { unit: 'mm', step: 0.001 }),
  flag(13, M, 'Report in inches', 'Makes the machine report positions and rates in inches. Copperline works in millimetres, so keep this off.'),
  flag(39, M, 'Legacy real-time commands', 'Lets the old single-character commands (?, !, ~) work inside comments and settings lines.'),
  num(398, M, 'Planner buffer blocks', 'How many moves the machine looks ahead. A bigger buffer plans corners better but uses more memory. Takes effect after a restart.', { step: 10 }),
  num(481, M, 'Auto report interval', 'Makes the machine send status reports by itself at this interval. 0 turns it off; Copperline asks for reports instead.', { unit: 'ms', step: 10 }),

  mask(5, IO, 'Limit inputs invert', `Flips the logic of the limit switch inputs. Set the bit of an axis whose switch is normally closed. ${AXIS_NOTE}`, AXES),
  mask(14, IO, 'Control inputs invert', 'Flips the logic of the control inputs. Set a bit when the input is normally closed.', CONTROLS),
  mask(15, IO, 'Coolant outputs invert', 'Flips the logic of the coolant outputs. Unused on a laser.', { 0: 'Flood', 1: 'Mist' }),
  mask(16, IO, 'Laser signals invert', 'Flips the logic of the spindle outputs. The laser power is the PWM output: invert it only if the laser is on when it should be off.', { 0: 'Spindle on', 1: 'Direction', 2: 'PWM' }),
  mask(17, IO, 'Control pull-ups off', 'Turns off the internal pull-up resistor of a control input. Leave it at 0 unless the input is wired with its own resistor.', CONTROLS),
  mask(18, IO, 'Limit pull-ups off', 'Turns off the internal pull-up resistor of a limit input. Leave it at 0 unless the switch has its own resistor.', AXES),
  mask(370, IO, 'Aux inputs invert', 'Flips the logic of the auxiliary input ports, one bit per port.', PORTS),
  mask(372, IO, 'Aux outputs invert', 'Flips the logic of the auxiliary output ports, one bit per port.', PORTS),

  flag(20, L, 'Soft limits', 'Refuses any move that would leave the machine travel (see Max travel). Needs a homed machine and correct travel values, or good moves get rejected.'),
  flag(21, L, 'Hard limits', 'Stops the machine with an alarm when a limit switch triggers. Leave it off when the switches are used only for homing.'),
  flag(40, L, 'Limit jogs to the workspace', 'Cuts jog moves short at the soft limits instead of raising an alarm.'),

  mask(22, H, 'Homing options', 'Turns homing on and sets how it behaves. Bit 0 must be on for $H to work.', {
    0: 'Homing enabled',
    1: 'Single-axis commands ($HX, $HY)',
    2: 'Homing required at start-up',
    3: 'Set machine origin to 0 after homing',
    4: 'Two limit switches on one axis',
    5: 'Allow manual homing',
    6: 'Override locks',
    7: 'Keep homed status on reset',
  }),
  mask(23, H, 'Homing direction invert', `Axes that home toward the negative end. Set these to match the side where the limit switch or stall detection is. ${AXIS_NOTE}`, AXES),
  num(24, H, 'Homing locate feed', 'Slow speed of the second, precise approach to the limit during homing.', { unit: 'mm/min', step: 50 }),
  num(25, H, 'Homing seek feed', 'Fast speed of the first approach to the limit during homing.', { unit: 'mm/min', step: 100 }),
  num(26, H, 'Homing debounce', 'How long to wait after a limit triggers before it is trusted. Raise it if homing stops early on noise.', { unit: 'ms', step: 5 }),
  num(27, H, 'Homing pull-off', 'How far the axis backs away from the limit after homing.', { unit: 'mm', step: 0.5 }),
  num(43, H, 'Homing locate passes', 'How many slow passes each axis makes to find the limit precisely.', { step: 1 }),
  mask(44, H, 'Homing phase 1 axes', `Axes that home first. Sensorless homing needs X and Y in separate phases, so put only one axis here. ${AXIS_NOTE}`, AXES),
  mask(45, H, 'Homing phase 2 axes', 'Axes that home second, after phase 1 has finished.', AXES),
  mask(46, H, 'Homing phase 3 axes', 'Axes that home third. 0 leaves the phase unused.', AXES),

  num(30, LA, 'Maximum laser power value', 'The S value that means 100% laser power. S commands in the G-code are scaled against it, so it must match the G-code Copperline exports.', { step: 1 }),
  num(31, LA, 'Minimum laser power value', 'The S value that means the lowest power. Leave it at 0 for a laser.', { step: 1 }),
  pick(32, LA, 'Mode of operation', 'Laser mode keeps the power in step with the speed and switches the laser off in rapid moves, so the resist is not burned when the head slows down. Engraving needs it on.', [
    { value: 0, label: 'Normal' },
    { value: 1, label: 'Laser' },
    { value: 2, label: 'Lathe' },
  ]),
  mask(9, LA, 'Laser PWM options', 'Turns the laser power output on. Without it the laser cannot be controlled.', { 0: 'PWM output enabled' }),
  num(33, LA, 'PWM frequency', 'Switching rate of the laser power signal. It must suit the laser driver; check its datasheet.', { unit: 'Hz', step: 100 }),
  num(34, LA, 'PWM off value', 'Duty cycle sent when the laser is off. Normally 0.', { unit: '%', step: 0.1 }),
  num(35, LA, 'PWM minimum', 'Duty cycle sent at the lowest power value. Raise it if the laser does not light at low values.', { unit: '%', step: 0.1 }),
  num(36, LA, 'PWM maximum', 'Duty cycle sent at the highest power value. Lower it to cap the laser power.', { unit: '%', step: 0.1 }),
  num(394, LA, 'Laser on delay', 'Delay after switching the laser on before the machine moves.', { unit: 's', step: 0.1 }),
  num(539, LA, 'Laser off delay', 'Delay after switching the laser off before the machine carries on.', { unit: 's', step: 0.1 }),

  ...perAxis(100, AX, 'steps per mm', 'How many motor steps move the axis by 1 mm. To calibrate, command a move and measure it: new value = old value × commanded distance ÷ measured distance.', { unit: 'steps/mm', step: 0.1 }),
  ...perAxis(110, AX, 'max rate', 'The fastest speed the axis may move, also used for rapid moves.', { unit: 'mm/min', step: 100 }),
  ...perAxis(120, AX, 'acceleration', 'How quickly the axis speeds up and slows down. Too high a value loses steps and shakes the machine.', { unit: 'mm/s²', step: 10 }),
  ...perAxis(130, AX, 'max travel', 'The length of the axis from end to end. Soft limits use it, so set it a little short of the measured length.', { unit: 'mm', step: 1 }),

  ...perAxis(140, D, 'motor current', 'RMS current the driver feeds the motor while it moves. Too low loses steps; too high overheats the motor and driver.', { unit: 'mA', step: 50 }, 2),
  ...perAxis(150, D, 'microsteps', 'Microstepping of the driver. Together with the steps per mm it must match the mechanics.', { step: 1 }, 2),
  ...perAxis(210, D, 'hold current', 'Current while the motor is idle, as a percentage of the run current.', { unit: '%', step: 5 }, 2),

  ...perAxis(200, SH, 'StallGuard threshold (seek)', 'Sensitivity of stall detection during the fast homing approach. A higher value detects a stall sooner; too high stops homing before the axis reaches the end.', { step: 1 }, 2),
  ...perAxis(220, SH, 'StallGuard threshold (locate)', 'Sensitivity of stall detection during the slow homing approach. A higher value detects a stall sooner.', { step: 1 }, 2),
  mask(339, SH, 'Sensorless homing axes', `Axes that home by detecting a stall instead of a limit switch. ${AXIS_NOTE}`, AXES),

  flag(41, P, 'Parking', 'Enables the parking move that lifts the tool away on a feed hold. A 2-axis laser does not use it.'),
  pick(42, P, 'Parking axis', 'The axis the parking move uses.', [
    { value: 0, label: 'X' },
    { value: 1, label: 'Y' },
    { value: 2, label: 'Z' },
  ]),
  num(56, P, 'Parking pull-out distance', 'How far the parking move pulls out before it parks.', { unit: 'mm', step: 0.5 }),
  num(57, P, 'Parking pull-out rate', 'Speed of the pull-out move.', { unit: 'mm/min', step: 10 }),
  num(58, P, 'Parking target', 'Position of the parked tool on the parking axis. Usually negative.', { unit: 'mm', step: 0.5, min: -Infinity }),
  num(59, P, 'Parking fast rate', 'Speed of the fast part of the parking move.', { unit: 'mm/min', step: 10 }),

  num(28, T, 'G73 retract', 'How far the drilling cycle (G73) backs off between peck moves. Unused for engraving.', { unit: 'mm', step: 0.1 }),
  pick(341, T, 'Tool change mode', 'What the machine does on M6. A laser has one tool, so keep Normal.', [
    { value: 0, label: 'Normal' },
    { value: 1, label: 'Manual touch off' },
    { value: 2, label: 'Manual touch off at G59.3' },
    { value: 3, label: 'Automatic touch off at G59.3' },
    { value: 4, label: 'Ignore M6' },
  ]),
  num(342, T, 'Tool change probing distance', 'How far the probe searches for the tool setter.', { unit: 'mm', step: 1 }),
  num(343, T, 'Tool change locate feed', 'Slow speed of the precise probe move.', { unit: 'mm/min', step: 5 }),
  num(344, T, 'Tool change seek rate', 'Fast speed of the first probe move.', { unit: 'mm/min', step: 10 }),
  num(345, T, 'Tool change pull-off rate', 'Speed of the move away from the probe after contact.', { unit: 'mm/min', step: 10 }),
  mask(346, T, 'Tool change options', 'Extra behaviour around M6.', { 0: 'Return to the original position after M6' }),

  flag(60, B, 'Restore overrides after reset', 'Keeps the feed, rapid and power overrides after a reset instead of returning them to 100%.'),
  mask(61, B, 'Safety door options', 'How the safety door input behaves.', { 0: 'Ignore the door when idle', 1: 'Keep coolant on when the door opens' }),
  flag(62, B, 'Sleep', 'Allows the machine to go to sleep after a period of no activity.'),
  mask(63, B, 'Feed hold actions', 'What happens to the laser when you pause a job. Keep "Switch the laser off" on, or the laser burns one spot while paused.', { 0: 'Switch the laser off during hold', 1: 'Restore laser and coolant on resume' }),
  flag(64, B, 'Alarm at start-up', 'Starts the machine in the alarm state, so you have to unlock or home it before it moves.'),
  flag(384, B, 'Disable G92 persistence', 'Stops the G92 offset from being kept across a reset or power cycle.'),
  num(392, B, 'Door laser delay', 'Wait for the laser to come back after the safety door closes.', { unit: 's', step: 0.5 }),
  num(393, B, 'Door coolant delay', 'Wait for the coolant to come back after the safety door closes.', { unit: 's', step: 0.5 }),
  flag(484, B, 'Unlock after E-stop', 'Requires an unlock ($X) after an emergency stop before the machine moves again.'),
  flag(485, B, 'Keep tool number', 'Remembers the active tool number over a restart.'),
  mask(486, B, 'Lock coordinate systems', 'Coordinate systems that G10 cannot change.', { 0: 'G59.1', 1: 'G59.2', 2: 'G59.3' }),
  num(673, B, 'Coolant on delay', 'Wait for the coolant to start before the machine moves.', { unit: 's', step: 0.5 }),
  mask(676, B, 'Reset actions', 'What a reset clears.', {
    0: 'Clear homed status if position is lost',
    1: 'Clear offsets (except G92)',
    2: 'Clear rapid override',
    3: 'Clear feed override',
  }),
];

const BY_ID = new Map(SETTINGS.map((def) => [def.id, def]));

/** The catalog entry for a setting, or a plain number entry for one the app does not know. */
export function settingDef(id: number): SettingDef {
  return (
    BY_ID.get(id) ?? {
      id,
      name: `Setting $${id}`,
      group: 'Behaviour',
      kind: 'number',
      description:
        'This setting belongs to the firmware build or a driver plugin, and Copperline has no description for it. Look it up in the firmware documentation before changing it.',
    }
  );
}

/** True when the value is acceptable for the setting. */
export function isValidSettingValue(def: SettingDef, value: number | null): boolean {
  if (value === null || !Number.isFinite(value)) {
    return false;
  }
  switch (def.kind) {
    case 'number':
      return def.min === undefined || value >= def.min;
    case 'mask':
      return Number.isInteger(value) && value >= 0;
    case 'switch':
      return value === 0 || value === 1;
    case 'select':
      return def.choices?.some((choice) => choice.value === value) ?? false;
  }
}

/** A value as the user reads it: "375 mm", "On", "Laser", or the plain number for a mask. */
export function formatSettingValue(def: SettingDef, value: number): string {
  switch (def.kind) {
    case 'switch':
      return value === 1 ? 'On' : 'Off';
    case 'select':
      return def.choices?.find((choice) => choice.value === value)?.label ?? String(value);
    case 'mask':
      return String(value);
    case 'number':
      return def.unit ? `${value} ${def.unit}` : String(value);
  }
}

/** For a mask, the labelled bits that differ, such as "Z: on". */
export function maskBitChanges(def: SettingDef, from: number, to: number): string[] {
  return Object.entries(def.bits ?? {})
    .filter(([bit]) => ((from ^ to) & (1 << Number(bit))) !== 0)
    .map(([bit, label]) => `${label}: ${(to & (1 << Number(bit))) !== 0 ? 'on' : 'off'}`);
}
