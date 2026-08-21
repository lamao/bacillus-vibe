import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/engine/settings';
import { Simulation } from '../../src/engine/simulation';
import { SeededRNG } from './seededRng';

/**
 * Extended-run smoke test for #12 (instruction-matrix end-to-end stability):
 * runs a realistically-sized, evolving population — mutation included, per
 * `reproduce` — for many ticks and asserts the invariants that "no crashes,
 * no NaN energy" implies, since a violation here would eventually corrupt
 * rendering, sensor reads, or the mutation RNG stream.
 */
describe('extended-run stability (#12)', () => {
  it(
    'keeps every organic and mineral numerically sane over 2000 ticks',
    () => {
      const settings = defaultSettings(20, 20);
      const sim = new Simulation(settings, new SeededRNG(7));
      for (let i = 0; i < 30; i++) {
        sim.spawnRandomOrganic();
      }

      // Plain-JS checks in the hot loop (thousands of organics x ticks) — a
      // single `expect` per violation kind afterward keeps this fast while
      // still failing with a clear message pointing at the broken invariant.
      let insaneNumber = false;
      let energyExceedsSize = false;
      let nonPositiveSize = false;
      let negativeWaste = false;
      let outOfBounds = false;

      for (let t = 0; t < 2000; t++) {
        sim.step();

        for (const organic of sim.grid.organics()) {
          if (!Number.isFinite(organic.energy) || !Number.isFinite(organic.size) || !Number.isFinite(organic.accumulatedWaste)) {
            insaneNumber = true;
          }
          // energy is capped at size everywhere it's gained (gainEnergy), and
          // every place it's spent only ever subtracts — the cap can't be beaten.
          if (organic.energy > organic.size + Number.EPSILON) energyExceedsSize = true;
          if (organic.size <= 0) nonPositiveSize = true;
          if (organic.accumulatedWaste < 0) negativeWaste = true;
          if (!sim.grid.inBounds(organic.position.x, organic.position.y)) outOfBounds = true;
        }
        for (const mineral of sim.grid.minerals()) {
          if (!Number.isFinite(mineral.size)) insaneNumber = true;
        }
      }

      expect(insaneNumber).toBe(false);
      expect(energyExceedsSize).toBe(false);
      expect(nonPositiveSize).toBe(false);
      expect(negativeWaste).toBe(false);
      expect(outOfBounds).toBe(false);
      // A healthy run shouldn't quietly wipe out the whole population — if this
      // starts failing, that's a real balance regression, not this test being wrong.
      expect(sim.grid.organics().length).toBeGreaterThan(0);
    },
    15000,
  );
});
