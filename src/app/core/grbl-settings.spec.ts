import { SETTINGS, SETTING_GROUPS, isValidSettingValue, settingDef } from './grbl-settings';

describe('grbl settings catalog', () => {
  it('has unique ids, a known group and an explanation for each', () => {
    const ids = SETTINGS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const def of SETTINGS) {
      expect(SETTING_GROUPS as readonly string[]).toContain(def.group);
      expect(def.description.length).toBeGreaterThanOrEqual(20);
      if (def.kind === 'mask') {
        expect(Object.keys(def.bits ?? {}).length).toBeGreaterThan(0);
      }
      if (def.kind === 'select') {
        expect(def.choices?.length).toBeGreaterThan(1);
      }
    }
  });

  it('describes unknown settings generically', () => {
    expect(settingDef(777).name).toBe('Setting $777');
  });

  it('validates values', () => {
    expect(isValidSettingValue(settingDef(130), 375)).toBe(true);
    expect(isValidSettingValue(settingDef(130), -1)).toBe(false);
    expect(isValidSettingValue(settingDef(58), -5)).toBe(true);
    expect(isValidSettingValue(settingDef(32), 3)).toBe(false);
    expect(isValidSettingValue(settingDef(3), 1.5)).toBe(false);
    expect(isValidSettingValue(settingDef(20), null)).toBe(false);
  });
});
