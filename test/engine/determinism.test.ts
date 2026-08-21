import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/engine/settings';
import { Simulation } from '../../src/engine/simulation';
import { SeededRNG } from './seededRng';

/**
 * Runs a fresh population through `tickCount` ticks and returns a plain-object
 * snapshot of the whole grid, suitable for deep equality — proving `Simulation`
 * (including `decideAction`'s per-tick `Random`-sensor draw, per #5 §7) is fully
 * deterministic given the same seed.
 */
function runSeeded(seed: number, tickCount: number) {
  const settings = defaultSettings(15, 15);
  const sim = new Simulation(settings, new SeededRNG(seed));
  for (let i = 0; i < 40; i++) {
    sim.spawnRandomOrganic();
  }
  for (let t = 0; t < tickCount; t++) {
    sim.step();
  }
  return sim.grid.entities().map((e) => JSON.parse(JSON.stringify(e)));
}

describe('Simulation determinism (#12)', () => {
  it('produces an identical grid across two runs seeded the same way', () => {
    const a = runSeeded(42, 300);
    const b = runSeeded(42, 300);
    expect(a).toEqual(b);
    // Sanity check the snapshot isn't trivially empty/frozen.
    expect(a.length).toBeGreaterThan(0);
  });

  it('produces a different grid for a different seed', () => {
    const a = runSeeded(42, 300);
    const b = runSeeded(1337, 300);
    expect(a).not.toEqual(b);
  });
});
