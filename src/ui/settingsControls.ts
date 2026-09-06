import { defaultSettings, TunableSettingKey, TunableSettings } from '../engine/settings';

/** Which section of the live-tuning panel (#31) a control appears under. */
export type SettingControlGroup = 'Mutation' | 'Energy & growth' | 'Ranges';

export interface SettingControlSpec {
  key: TunableSettingKey;
  label: string;
  description: string;
  group: SettingControlGroup;
  min: number;
  max: number;
  step: number;
  /** Formats a raw settings value for display next to the slider. */
  format: (value: number) => string;
}

const plain = (value: number): string => Number(value.toFixed(3)).toString();
const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;
const multiplier = (value: number): string => `${value.toFixed(2)}x`;

/** A slider's numeric range, bundled into one argument so `spec` below stays under the linter's parameter-count limit. */
interface SliderRange {
  min: number;
  max: number;
  step: number;
  /** Defaults to `plain` since most controls below are raw numbers, not fractions or multipliers. */
  format?: (value: number) => string;
}

/** Builds one `SettingControlSpec`. */
function spec(
  key: TunableSettingKey,
  label: string,
  description: string,
  group: SettingControlGroup,
  range: SliderRange,
): SettingControlSpec {
  return { key, label, description, group, min: range.min, max: range.max, step: range.step, format: range.format ?? plain };
}

/**
 * One control per live-tunable `Settings` field, grouped for the panel and given a
 * slider range wide enough to explore extremes without making the default sit at an
 * unreadable edge. `mutationRate` and `behaviorMutationRatio` get their own group and
 * the finest step, per #31's primary motivation of balancing mutation-driven
 * adaptation by feel: `mutateDNA` (`engine/dna.ts`) picks a mutation's category
 * (behavior vs. the point traits as a group) via `behaviorMutationRatio` before
 * picking which variable within that category changes, so raising the ratio drives
 * faster behavioral adaptation without also speeding up point-trait mutation.
 *
 * Separate rates per individual point trait (body/consume/produce/toxin each tuned
 * independently) were considered and dropped: they'd still change the DNA model
 * itself for a finer grain than #31 asked for — the category-level split above
 * already covers the "how do I make behavior mutate faster" motivation.
 */
export const SETTING_CONTROL_SPECS: readonly SettingControlSpec[] = [
  spec('mutationRate', 'Mutation rate', 'Probability a mutation happens at all on reproduction.', 'Mutation', {
    min: 0,
    max: 0.5,
    step: 0.001,
    format: percent,
  }),
  spec(
    'behaviorMutationRatio',
    'Behavior mutation ratio',
    'Given a mutation happens, the chance it targets behavior rather than a point trait (body/consume/produce/toxin).',
    'Mutation',
    { min: 0, max: 1, step: 0.01, format: percent },
  ),
  spec('biteYield', 'Bite yield', 'Energy gained from biting an adjacent food entity while moving.', 'Energy & growth', {
    min: 0,
    max: 500,
    step: 5,
  }),
  spec('sunYield', 'Sun yield', 'Energy gained per tick by Sun-consumers.', 'Energy & growth', { min: 0, max: 100, step: 1 }),
  spec(
    'mineralsYield',
    'Minerals yield',
    'Max amount drained from a matching mineral/organic per tick (passive digestion).',
    'Energy & growth',
    { min: 0, max: 50, step: 1 },
  ),
  spec('moveConsumption', 'Move consumption', 'Energy cost of taking a move step.', 'Energy & growth', { min: 0, max: 50, step: 1 }),
  spec('permanentConsumption', 'Permanent consumption', 'Base metabolic energy cost per tick, always applied.', 'Energy & growth', {
    min: 0,
    max: 50,
    step: 1,
  }),
  spec(
    'productionPerformance',
    'Production performance',
    'Fraction of consumed food lost to inefficiency, becomes waste.',
    'Energy & growth',
    { min: 0, max: 1, step: 0.01, format: percent },
  ),
  spec('mineralDegradation', 'Mineral degradation', 'Mineral size decay per tick.', 'Energy & growth', { min: 0, max: 20, step: 1 }),
  spec('defaultSize', 'Default size', 'Starting size of a spawned/offspring organic.', 'Energy & growth', {
    min: 100,
    max: 2000,
    step: 10,
  }),
  spec('reproductionThreshold', 'Reproduction threshold', 'Energy level that triggers splitting.', 'Energy & growth', {
    min: 200,
    max: 5000,
    step: 50,
  }),
  spec('maxSize', 'Max size', 'Hard cap on size/energy.', 'Energy & growth', { min: 200, max: 6000, step: 50 }),
  spec('maxAge', 'Max age', 'Organic dies of old age at this age.', 'Energy & growth', { min: 100, max: 5000, step: 50 }),
  spec(
    'returnHealthWhenReproductionFails',
    'Failed-split refund',
    "Fraction of the would-be offspring's energy refunded to the parent if reproduction can't place the offspring.",
    'Energy & growth',
    { min: 0, max: 1, step: 0.01, format: percent },
  ),
  spec(
    'wasteIntoxicationFactor',
    'Waste intoxication',
    'Self-damage multiplier for waste an organic tried to Release but had no room to place — 0 disables it, 1 is the original 1:1 cost.',
    'Energy & growth',
    { min: 0, max: 3, step: 0.05, format: multiplier },
  ),
  spec('visionRange', 'Vision range', 'Radius (Chebyshev distance) for spotting food to move toward.', 'Ranges', {
    min: 0,
    max: 10,
    step: 1,
  }),
  spec('consumingRange', 'Consuming range', 'Radius for passive mineral/organic digestion.', 'Ranges', { min: 0, max: 10, step: 1 }),
  spec('productionRange', 'Production range', 'Radius for depositing waste as minerals.', 'Ranges', { min: 0, max: 10, step: 1 }),
  spec('toxinRange', 'Toxin range', 'Radius within which toxin sources damage a cell.', 'Ranges', { min: 0, max: 10, step: 1 }),
  spec('reproductionRange', 'Reproduction range', 'Radius offspring can be placed at, relative to parent.', 'Ranges', {
    min: 0,
    max: 10,
    step: 1,
  }),
];

/** Ordered group names, for rendering the panel's sections in a fixed, deliberate order rather than spec array order. */
export const SETTING_CONTROL_GROUPS: readonly SettingControlGroup[] = ['Mutation', 'Energy & growth', 'Ranges'];

export function specsInGroup(group: SettingControlGroup): SettingControlSpec[] {
  return SETTING_CONTROL_SPECS.filter((spec) => spec.group === group);
}

/** The defaults panel sliders reset to, keyed the same way as `SETTING_CONTROL_SPECS`. */
export function defaultTunableSettings(): TunableSettings {
  return defaultSettings();
}
