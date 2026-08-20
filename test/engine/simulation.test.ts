import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/engine/settings';
import { Simulation, tick } from '../../src/engine/simulation';
import { dna, emptyGrid, organic, place, testSettings } from './fixtures';
import { MockRNG } from './mockRng';

describe('tick', () => {
  it('runs all phases without throwing on an empty grid', () => {
    const settings = testSettings();
    const grid = emptyGrid(settings);
    expect(() => tick(grid, settings, new MockRNG([0.5]), () => 0)).not.toThrow();
  });

  it('ages a stationary Sun-eating organic and lets it starve of old age', () => {
    const settings = testSettings({ maxAge: 2, permanentConsumption: 0, sunYield: 0 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { dna: dna({ consume: 'Sun', canMove: false }), energy: 100, age: 0 });
    place(grid, o);
    let idc = 0;
    tick(grid, settings, new MockRNG([0.5]), () => idc++);
    expect(grid.get(5, 5)).toBe(o);
    expect(o.age).toBe(1);
    tick(grid, settings, new MockRNG([0.5]), () => idc++);
    // age reaches maxAge(2) -> dies this tick, corpse left behind
    expect(grid.get(5, 5)).toMatchObject({ kind: 'mineral' });
  });
});

describe('Simulation', () => {
  it('constructs a grid matching the given settings dimensions', () => {
    const sim = new Simulation(defaultSettings(12, 8), new MockRNG([0.5]));
    expect(sim.grid.width).toBe(12);
    expect(sim.grid.height).toBe(8);
    expect(sim.tickCount).toBe(0);
  });

  it('spawnOrganicAt places an organic with default-size energy, and refuses an occupied cell', () => {
    const sim = new Simulation(testSettings(), new MockRNG([0.5]));
    const o = sim.spawnOrganicAt({ x: 2, y: 2 }, dna());
    expect(o).not.toBeNull();
    expect(sim.grid.get(2, 2)).toBe(o);
    expect(o?.energy).toBe(sim.settings.defaultSize);

    const blocked = sim.spawnOrganicAt({ x: 2, y: 2 }, dna());
    expect(blocked).toBeNull();
  });

  it('spawnOrganicAt generates random DNA when none is given', () => {
    const sim = new Simulation(testSettings(), new MockRNG([0.1, 0.2, 0.3, 0.4, 0.9]));
    const o = sim.spawnOrganicAt({ x: 3, y: 3 });
    expect(o?.dna).toBeDefined();
  });

  it('spawnRandomOrganic returns null once the grid is full', () => {
    const settings = testSettings({ width: 1, height: 1 });
    const sim = new Simulation(settings, new MockRNG([0]));
    const first = sim.spawnRandomOrganic(dna());
    expect(first).not.toBeNull();
    const second = sim.spawnRandomOrganic(dna());
    expect(second).toBeNull();
  });

  it('step() advances the tick counter and mutates the grid', () => {
    const settings = testSettings({ permanentConsumption: 10 });
    const sim = new Simulation(settings, new MockRNG([0.5]));
    const o = sim.spawnOrganicAt({ x: 5, y: 5 }, dna({ canMove: false, consume: 'Green' }));
    const before = o?.energy ?? 0;
    sim.step();
    expect(sim.tickCount).toBe(1);
    expect(o?.energy).toBeLessThan(before);
  });
});
