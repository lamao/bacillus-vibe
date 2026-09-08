import { randomDNA, randomInstructionMatrix, randomPhysicalSubstance } from './dna';
import { DEFAULT_GRID_SIZE, Settings, defaultSettings } from './settings';
import { Simulation } from './simulation';
import { DNA } from './types';

/** How a scenario preset (#32) generates each initial organic's DNA. */
export type GenomeMode =
  /** Each organic gets its own independently-random DNA (the existing default behavior). */
  | 'random'
  /** One random DNA is generated once and shared by every organic in the initial population. */
  | 'shared'
  /** Each organic gets independently-random DNA, but with a fully randomized instruction matrix instead of the tuned starter genome. */
  | 'randomBehavior';

/** A named settings bundle + initial seeding recipe (#32), selectable from the Controls menu. */
export interface ScenarioPreset {
  id: string;
  name: string;
  description: string;
  /** Applied on top of `defaultSettings()` for this scenario. */
  settingsOverrides: Partial<Settings>;
  populationCount: number;
  genomeMode: GenomeMode;
  /** Extra minerals scattered onto random free cells at start, on top of the seeded population. */
  extraMinerals?: number;
}

export const SCENARIO_PRESETS: readonly ScenarioPreset[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Default settings and starting population.',
    settingsOverrides: {},
    populationCount: 150,
    genomeMode: 'random',
  },
  {
    id: 'overcrowded',
    name: 'Overcrowded',
    description: 'High initial population competing over scarce food.',
    settingsOverrides: { sunYield: 12, mineralsYield: 5 },
    populationCount: 600,
    genomeMode: 'random',
  },
  {
    id: 'low-diversity',
    name: 'Low diversity',
    description: 'Every organic starts from the same genome, with mutation reduced.',
    settingsOverrides: { mutationRate: 0.001 },
    populationCount: 150,
    genomeMode: 'shared',
  },
  {
    id: 'food-rich',
    name: 'Food-rich',
    description: 'A sparse population surrounded by abundant food, with little competition.',
    settingsOverrides: { sunYield: 40, mineralsYield: 20 },
    populationCount: 60,
    extraMinerals: 400,
    genomeMode: 'random',
  },
  {
    id: 'wild-genomes',
    name: 'Wild genomes',
    description: "Every organic starts with a fully randomized instruction matrix, instead of the tuned starter genome.",
    settingsOverrides: {},
    populationCount: 150,
    genomeMode: 'randomBehavior',
  },
] as const;

/** Draws the next organic's DNA per `preset.genomeMode`; `sharedRef` carries the one shared DNA across calls for `'shared'` mode. */
function nextDNA(preset: ScenarioPreset, simulation: Simulation, sharedRef: { dna?: DNA }): DNA | undefined {
  switch (preset.genomeMode) {
    case 'random':
      // undefined defers generation to spawnRandomOrganic's own randomDNA(this.rng) call.
      return undefined;
    case 'shared':
      sharedRef.dna ??= randomDNA(simulation.rng);
      return sharedRef.dna;
    case 'randomBehavior':
      return randomDNA(simulation.rng, randomInstructionMatrix(simulation.rng));
  }
}

/** Builds a fresh `Simulation` from a scenario preset: settings overrides applied, population + extra minerals seeded. */
export function buildScenario(preset: ScenarioPreset, width = DEFAULT_GRID_SIZE, height = DEFAULT_GRID_SIZE): Simulation {
  const settings: Settings = { ...defaultSettings(width, height), ...preset.settingsOverrides };
  const simulation = new Simulation(settings);

  const sharedRef: { dna?: DNA } = {};
  for (let i = 0; i < preset.populationCount; i++) {
    simulation.spawnRandomOrganic(nextDNA(preset, simulation, sharedRef));
  }

  for (let i = 0; i < (preset.extraMinerals ?? 0); i++) {
    simulation.spawnRandomMineral(randomPhysicalSubstance(simulation.rng), settings.defaultSize);
  }

  return simulation;
}
