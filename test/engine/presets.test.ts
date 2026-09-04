import { describe, expect, it } from 'vitest';
import { starterInstructionMatrix } from '../../src/engine/dna';
import { SCENARIO_PRESETS, ScenarioPreset, buildScenario } from '../../src/engine/presets';
import { Organic } from '../../src/engine/types';

function organics(preset: ScenarioPreset): Organic[] {
  return buildScenario(preset, 40, 40)
    .grid.entities()
    .filter((e): e is Organic => e.kind === 'organic');
}

describe('SCENARIO_PRESETS', () => {
  it('has unique, non-empty ids', () => {
    const ids = SCENARIO_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.length).toBeGreaterThan(0);
  });
});

describe('buildScenario', () => {
  it('applies the grid dimensions and settings overrides given', () => {
    const preset = SCENARIO_PRESETS.find((p) => p.id === 'overcrowded')!;
    const sim = buildScenario(preset, 40, 30);
    expect(sim.grid.width).toBe(40);
    expect(sim.grid.height).toBe(30);
    expect(sim.settings.sunYield).toBe(preset.settingsOverrides.sunYield);
    expect(sim.settings.mineralsYield).toBe(preset.settingsOverrides.mineralsYield);
  });

  it('seeds exactly populationCount organics, when the grid has room', () => {
    for (const preset of SCENARIO_PRESETS) {
      const sim = buildScenario(preset, 40, 40);
      const count = sim.grid.organics().length;
      expect(count).toBe(preset.populationCount);
    }
  });

  it("'classic' matches defaultSettings() with no overrides", () => {
    const preset = SCENARIO_PRESETS.find((p) => p.id === 'classic')!;
    const sim = buildScenario(preset, 12, 12);
    expect(sim.settings.sunYield).toBe(25);
    expect(sim.settings.mutationRate).toBe(0.01);
  });

  it("'random' genome mode gives each organic independently-random DNA using the starter instruction matrix", () => {
    const preset = SCENARIO_PRESETS.find((p) => p.id === 'classic')!;
    const pop = organics(preset);
    expect(pop.length).toBeGreaterThan(1);
    for (const o of pop) expect(o.dna.behavior).toEqual(starterInstructionMatrix());
    // Not every organic has identical DNA (random substances differ across a large population).
    const distinctBodies = new Set(pop.map((o) => o.dna.body));
    expect(distinctBodies.size).toBeGreaterThan(1);
  });

  it("'shared' genome mode gives every organic in the population the exact same DNA object", () => {
    const preset = SCENARIO_PRESETS.find((p) => p.id === 'low-diversity')!;
    const pop = organics(preset);
    expect(pop.length).toBeGreaterThan(1);
    const first = pop[0].dna;
    for (const o of pop) expect(o.dna).toBe(first);
  });

  it("'randomBehavior' genome mode gives organics a randomized instruction matrix, not the starter one", () => {
    const preset = SCENARIO_PRESETS.find((p) => p.id === 'wild-genomes')!;
    const pop = organics(preset);
    expect(pop.length).toBeGreaterThan(1);
    const starter = starterInstructionMatrix();
    const anyDiffer = pop.some((o) => JSON.stringify(o.dna.behavior) !== JSON.stringify(starter));
    expect(anyDiffer).toBe(true);
  });

  it("scatters extraMinerals free-standing minerals for a preset that specifies them", () => {
    const preset = SCENARIO_PRESETS.find((p) => p.id === 'food-rich')!;
    const sim = buildScenario(preset, 40, 40);
    expect(sim.grid.minerals().length).toBe(preset.extraMinerals);
  });

  it('presets without extraMinerals seed none', () => {
    const preset = SCENARIO_PRESETS.find((p) => p.id === 'classic')!;
    const sim = buildScenario(preset, 40, 40);
    expect(sim.grid.minerals().length).toBe(0);
  });
});
