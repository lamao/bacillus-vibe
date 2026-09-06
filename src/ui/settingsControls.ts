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

/** Builds one `SettingControlSpec`; `format` defaults to `plain` since most controls below are raw numbers, not fractions or multipliers. */
function spec(
  key: TunableSettingKey,
  label: string,
  description: string,
  group: SettingControlGroup,
  min: number,
  max: number,
  step: number,
  format: (value: number) => string = plain,
): SettingControlSpec {
  return { key, label, description, group, min, max, step, format };
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
  spec('mutationRate', 'Mutation rate', 'Probability a mutation happens at all on reproduction.', 'Mutation', 0, 0.5, 0.001, percent),
  spec(
    'behaviorMutationRatio',
    'Behavior mutation ratio',
    'Given a mutation happens, the chance it targets behavior rather than a point trait (body/consume/produce/toxin).',
    'Mutation',
    0,
    1,
    0.01,
    percent,
  ),
  spec('biteYield', 'Bite yield', 'Energy gained from biting an adjacent food entity while moving.', 'Energy & growth', 0, 500, 5),
  spec('sunYield', 'Sun yield', 'Energy gained per tick by Sun-consumers.', 'Energy & growth', 0, 100, 1),
  spec(
    'mineralsYield',
    'Minerals yield',
    'Max amount drained from a matching mineral/organic per tick (passive digestion).',
    'Energy & growth',
    0,
    50,
    1,
  ),
  spec('moveConsumption', 'Move consumption', 'Energy cost of taking a move step.', 'Energy & growth', 0, 50, 1),
  spec('permanentConsumption', 'Permanent consumption', 'Base metabolic energy cost per tick, always applied.', 'Energy & growth', 0, 50, 1),
  spec(
    'productionPerformance',
    'Production performance',
    'Fraction of consumed food lost to inefficiency, becomes waste.',
    'Energy & growth',
    0,
    1,
    0.01,
    percent,
  ),
  spec('mineralDegradation', 'Mineral degradation', 'Mineral size decay per tick.', 'Energy & growth', 0, 20, 1),
  spec('defaultSize', 'Default size', 'Starting size of a spawned/offspring organic.', 'Energy & growth', 100, 2000, 10),
  spec('reproductionThreshold', 'Reproduction threshold', 'Energy level that triggers splitting.', 'Energy & growth', 200, 5000, 50),
  spec('maxSize', 'Max size', 'Hard cap on size/energy.', 'Energy & growth', 200, 6000, 50),
  spec('maxAge', 'Max age', 'Organic dies of old age at this age.', 'Energy & growth', 100, 5000, 50),
  spec(
    'returnHealthWhenReproductionFails',
    'Failed-split refund',
    "Fraction of the would-be offspring's energy refunded to the parent if reproduction can't place the offspring.",
    'Energy & growth',
    0,
    1,
    0.01,
    percent,
  ),
  spec(
    'wasteIntoxicationFactor',
    'Waste intoxication',
    'Self-damage multiplier for waste an organic tried to Release but had no room to place — 0 disables it, 1 is the original 1:1 cost.',
    'Energy & growth',
    0,
    3,
    0.05,
    multiplier,
  ),
  spec('visionRange', 'Vision range', 'Radius (Chebyshev distance) for spotting food to move toward.', 'Ranges', 0, 10, 1),
  spec('consumingRange', 'Consuming range', 'Radius for passive mineral/organic digestion.', 'Ranges', 0, 10, 1),
  spec('productionRange', 'Production range', 'Radius for depositing waste as minerals.', 'Ranges', 0, 10, 1),
  spec('toxinRange', 'Toxin range', 'Radius within which toxin sources damage a cell.', 'Ranges', 0, 10, 1),
  spec('reproductionRange', 'Reproduction range', 'Radius offspring can be placed at, relative to parent.', 'Ranges', 0, 10, 1),
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
