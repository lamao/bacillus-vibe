import { describe, expect, it } from 'vitest';
import { defaultSettings, TunableSettingKey } from '../../src/engine/settings';
import { defaultTunableSettings, SETTING_CONTROL_GROUPS, SETTING_CONTROL_SPECS, specsInGroup } from '../../src/ui/settingsControls';

describe('SETTING_CONTROL_SPECS', () => {
  it('covers every tunable Settings key exactly once', () => {
    const expectedKeys = (Object.keys(defaultSettings()) as (keyof ReturnType<typeof defaultSettings>)[]).filter(
      (key): key is TunableSettingKey => key !== 'width' && key !== 'height',
    );
    const specKeys = SETTING_CONTROL_SPECS.map((spec) => spec.key);
    expect(new Set(specKeys).size).toBe(specKeys.length);
    expect([...specKeys].sort()).toEqual([...expectedKeys].sort());
  });

  it('brackets the default value within [min, max] for every spec', () => {
    const defaults = defaultTunableSettings();
    for (const spec of SETTING_CONTROL_SPECS) {
      const value = defaults[spec.key];
      expect(value, `${spec.key} default below min`).toBeGreaterThanOrEqual(spec.min);
      expect(value, `${spec.key} default above max`).toBeLessThanOrEqual(spec.max);
      expect(spec.min, `${spec.key} min >= max`).toBeLessThan(spec.max);
      expect(spec.step, `${spec.key} non-positive step`).toBeGreaterThan(0);
    }
  });

  it('assigns every spec to one of the known groups', () => {
    for (const spec of SETTING_CONTROL_SPECS) {
      expect(SETTING_CONTROL_GROUPS).toContain(spec.group);
    }
  });

  it('groups specs so each appears in exactly the group it declares', () => {
    for (const group of SETTING_CONTROL_GROUPS) {
      const bySpec = specsInGroup(group);
      expect(bySpec.every((spec) => spec.group === group)).toBe(true);
    }
    const total = SETTING_CONTROL_GROUPS.reduce((sum, group) => sum + specsInGroup(group).length, 0);
    expect(total).toBe(SETTING_CONTROL_SPECS.length);
  });
});
