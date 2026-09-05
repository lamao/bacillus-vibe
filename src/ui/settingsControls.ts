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
  {
    key: 'mutationRate',
    label: 'Mutation rate',
    description: 'Probability a mutation happens at all on reproduction.',
    group: 'Mutation',
    min: 0,
    max: 0.5,
    step: 0.001,
    format: percent,
  },
  {
    key: 'behaviorMutationRatio',
    label: 'Behavior mutation ratio',
    description: 'Given a mutation happens, the chance it targets behavior rather than a point trait (body/consume/produce/toxin).',
    group: 'Mutation',
    min: 0,
    max: 1,
    step: 0.01,
    format: percent,
  },
  {
    key: 'biteYield',
    label: 'Bite yield',
    description: 'Energy gained from biting an adjacent food entity while moving.',
    group: 'Energy & growth',
    min: 0,
    max: 500,
    step: 5,
    format: plain,
  },
  {
    key: 'sunYield',
    label: 'Sun yield',
    description: 'Energy gained per tick by Sun-consumers.',
    group: 'Energy & growth',
    min: 0,
    max: 100,
    step: 1,
    format: plain,
  },
  {
    key: 'mineralsYield',
    label: 'Minerals yield',
    description: 'Max amount drained from a matching mineral/organic per tick (passive digestion).',
    group: 'Energy & growth',
    min: 0,
    max: 50,
    step: 1,
    format: plain,
  },
  {
    key: 'moveConsumption',
    label: 'Move consumption',
    description: 'Energy cost of taking a move step.',
    group: 'Energy & growth',
    min: 0,
    max: 50,
    step: 1,
    format: plain,
  },
  {
    key: 'permanentConsumption',
    label: 'Permanent consumption',
    description: 'Base metabolic energy cost per tick, always applied.',
    group: 'Energy & growth',
    min: 0,
    max: 50,
    step: 1,
    format: plain,
  },
  {
    key: 'productionPerformance',
    label: 'Production performance',
    description: 'Fraction of consumed food lost to inefficiency, becomes waste.',
    group: 'Energy & growth',
    min: 0,
    max: 1,
    step: 0.01,
    format: percent,
  },
  {
    key: 'mineralDegradation',
    label: 'Mineral degradation',
    description: 'Mineral size decay per tick.',
    group: 'Energy & growth',
    min: 0,
    max: 20,
    step: 1,
    format: plain,
  },
  {
    key: 'defaultSize',
    label: 'Default size',
    description: 'Starting size of a spawned/offspring organic.',
    group: 'Energy & growth',
    min: 100,
    max: 2000,
    step: 10,
    format: plain,
  },
  {
    key: 'reproductionThreshold',
    label: 'Reproduction threshold',
    description: 'Energy level that triggers splitting.',
    group: 'Energy & growth',
    min: 200,
    max: 5000,
    step: 50,
    format: plain,
  },
  {
    key: 'maxSize',
    label: 'Max size',
    description: 'Hard cap on size/energy.',
    group: 'Energy & growth',
    min: 200,
    max: 6000,
    step: 50,
    format: plain,
  },
  {
    key: 'maxAge',
    label: 'Max age',
    description: 'Organic dies of old age at this age.',
    group: 'Energy & growth',
    min: 100,
    max: 5000,
    step: 50,
    format: plain,
  },
  {
    key: 'returnHealthWhenReproductionFails',
    label: 'Failed-split refund',
    description: "Fraction of the would-be offspring's energy refunded to the parent if reproduction can't place the offspring.",
    group: 'Energy & growth',
    min: 0,
    max: 1,
    step: 0.01,
    format: percent,
  },
  {
    key: 'wasteIntoxicationFactor',
    label: 'Waste intoxication',
    description: "Self-damage multiplier for waste an organic tried to Release but had no room to place — 0 disables it, 1 is the original 1:1 cost.",
    group: 'Energy & growth',
    min: 0,
    max: 3,
    step: 0.05,
    format: multiplier,
  },
  {
    key: 'visionRange',
    label: 'Vision range',
    description: 'Radius (Chebyshev distance) for spotting food to move toward.',
    group: 'Ranges',
    min: 0,
    max: 10,
    step: 1,
    format: plain,
  },
  {
    key: 'consumingRange',
    label: 'Consuming range',
    description: 'Radius for passive mineral/organic digestion.',
    group: 'Ranges',
    min: 0,
    max: 10,
    step: 1,
    format: plain,
  },
  {
    key: 'productionRange',
    label: 'Production range',
    description: 'Radius for depositing waste as minerals.',
    group: 'Ranges',
    min: 0,
    max: 10,
    step: 1,
    format: plain,
  },
  {
    key: 'toxinRange',
    label: 'Toxin range',
    description: 'Radius within which toxin sources damage a cell.',
    group: 'Ranges',
    min: 0,
    max: 10,
    step: 1,
    format: plain,
  },
  {
    key: 'reproductionRange',
    label: 'Reproduction range',
    description: 'Radius offspring can be placed at, relative to parent.',
    group: 'Ranges',
    min: 0,
    max: 10,
    step: 1,
    format: plain,
  },
] as const;

/** Ordered group names, for rendering the panel's sections in a fixed, deliberate order rather than spec array order. */
export const SETTING_CONTROL_GROUPS: readonly SettingControlGroup[] = ['Mutation', 'Energy & growth', 'Ranges'];

export function specsInGroup(group: SettingControlGroup): SettingControlSpec[] {
  return SETTING_CONTROL_SPECS.filter((spec) => spec.group === group);
}

/** The defaults panel sliders reset to, keyed the same way as `SETTING_CONTROL_SPECS`. */
export function defaultTunableSettings(): TunableSettings {
  return defaultSettings();
}
