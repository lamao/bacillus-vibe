import { describe, expect, it } from 'vitest';
import { SeededRNG } from '../../src/engine/rng';
import { defaultSettings } from '../../src/engine/settings';
import { Simulation, SIMULATION_STATE_VERSION, tick } from '../../src/engine/simulation';
import { Instruction } from '../../src/engine/types';
import { dna, emptyGrid, mineral, organic, place, testSettings } from './fixtures';
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
    const o = organic({ x: 5, y: 5 }, { dna: dna({ consume: 'Sun' }), energy: 100, age: 0 });
    place(grid, o);
    let idc = 0;
    const first = tick(grid, settings, new MockRNG([0.5]), () => idc++);
    expect(grid.get(5, 5)).toBe(o);
    expect(o.age).toBe(1);
    expect(first).toEqual({ births: 0, deaths: 0 });
    const second = tick(grid, settings, new MockRNG([0.5]), () => idc++);
    // age reaches maxAge(2) -> dies this tick, corpse left behind
    expect(grid.get(5, 5)).toMatchObject({ kind: 'mineral' });
    expect(second).toEqual({ births: 0, deaths: 1 });
  });

  it("returns the reproduce phase's birth count for a hand-built reproducing genome", () => {
    // A single-state genome that always chooses Split (Attempt) and never leaves state 0
    // (Random is always >= 0, jumpOffset 0 loops back to itself) — same pattern as the
    // hunting genome below, but for reproduce() instead of moveOrganics().
    const splitForever: Instruction = {
      action: { type: 'Split', mode: 'Attempt' },
      sensor: 'Random',
      comparator: '>=',
      threshold: 0,
      jumpOffset: 0,
    };
    const settings = testSettings({ reproductionThreshold: 500, defaultSize: 100, mutationRate: 0 });
    const grid = emptyGrid(settings);
    const parent = organic({ x: 5, y: 5 }, { dna: dna({ behavior: [splitForever] }), energy: 1000, size: 1000 });
    place(grid, parent);
    let idc = 0;
    const result = tick(grid, settings, new MockRNG([0.5]), () => idc++);
    expect(result).toEqual({ births: 1, deaths: 0 });
    expect(grid.entities()).toHaveLength(2); // parent + offspring
  });

  it('drives movement end-to-end via decideAction for a hand-built hunting genome (#9)', () => {
    // A single-state genome that always chooses Move(TowardConsume) and never
    // leaves state 0 (Random is always >= 0, jumpOffset 0 loops back to itself).
    const huntForever: Instruction = {
      action: { type: 'Move', mode: 'TowardConsume' },
      sensor: 'Random',
      comparator: '>=',
      threshold: 0,
      jumpOffset: 0,
    };
    const settings = testSettings({ visionRange: 10, moveConsumption: 0, permanentConsumption: 0 });
    const grid = emptyGrid(settings);
    const hunter = organic(
      { x: 0, y: 0 },
      { dna: dna({ consume: 'Green', behavior: [huntForever] }), energy: 1000, size: 1000 },
    );
    const food = mineral({ x: 5, y: 5 }, 'Green', 1000);
    place(grid, hunter, food);
    let idc = 0;

    for (let i = 0; i < 4; i++) {
      tick(grid, settings, new MockRNG([0.5]), () => idc++);
    }

    expect(hunter.chosenAction).toEqual({ type: 'Move', mode: 'TowardConsume' });
    expect(hunter.position).toEqual({ x: 4, y: 4 }); // stepped diagonally toward the food each tick
    expect(hunter.currentState).toBe(0); // loops on the same state, per the hand-built genome
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

  it('spawnMineralAt places a mineral, and refuses an occupied cell', () => {
    const sim = new Simulation(testSettings(), new MockRNG([0.5]));
    const m = sim.spawnMineralAt({ x: 2, y: 2 }, 'Blue', 300);
    expect(m).not.toBeNull();
    expect(sim.grid.get(2, 2)).toBe(m);

    const blocked = sim.spawnMineralAt({ x: 2, y: 2 }, 'Green', 100);
    expect(blocked).toBeNull();
  });

  it('spawnRandomMineral places on a free cell and returns null once the grid is full', () => {
    const settings = testSettings({ width: 1, height: 1 });
    const sim = new Simulation(settings, new MockRNG([0]));
    const first = sim.spawnRandomMineral('Red', 200);
    expect(first).not.toBeNull();
    const second = sim.spawnRandomMineral('Red', 200);
    expect(second).toBeNull();
  });

  it('step() advances the tick counter and mutates the grid', () => {
    const settings = testSettings({ permanentConsumption: 10 });
    const sim = new Simulation(settings, new MockRNG([0.5]));
    const o = sim.spawnOrganicAt({ x: 5, y: 5 }, dna({ consume: 'Green' }));
    const before = o?.energy ?? 0;
    sim.step();
    expect(sim.tickCount).toBe(1);
    expect(o?.energy).toBeLessThan(before);
  });

  it('step() accumulates totalBirths and totalDeaths across multiple ticks (not just the latest one)', () => {
    const settings = testSettings({ maxAge: 2, permanentConsumption: 0, sunYield: 0 });
    const sim = new Simulation(settings, new MockRNG([0.5]));
    sim.spawnOrganicAt({ x: 5, y: 5 }, dna({ consume: 'Sun' }));
    expect(sim.totalBirths).toBe(0);
    expect(sim.totalDeaths).toBe(0);

    sim.step(); // age 0 -> 1, still under maxAge(2)
    expect(sim.totalDeaths).toBe(0);

    sim.step(); // age reaches maxAge(2) -> dies this tick
    expect(sim.totalBirths).toBe(0);
    expect(sim.totalDeaths).toBe(1);
  });
});

describe('Simulation save/load (#29)', () => {
  it('toState() throws when the simulation is not backed by a SeededRNG', () => {
    const sim = new Simulation(testSettings(), new MockRNG([0.5]));
    expect(() => sim.toState()).toThrow();
  });

  it('toState() captures a JSON-serializable snapshot with the version tag', () => {
    const sim = new Simulation(testSettings(), new SeededRNG(7));
    sim.spawnOrganicAt({ x: 1, y: 1 }, dna());
    const state = sim.toState();
    expect(state.version).toBe(SIMULATION_STATE_VERSION);
    // Must survive an actual JSON round-trip, not just structural equality in memory —
    // this is exactly what localStorage/file save-load does with it.
    expect(() => JSON.parse(JSON.stringify(state))).not.toThrow();
  });

  it('fromState() rebuilds the grid, counters, and settings from a snapshot', () => {
    const settings = testSettings({ maxAge: 2, permanentConsumption: 0, sunYield: 0 });
    const sim = new Simulation(settings, new SeededRNG(1));
    sim.spawnOrganicAt({ x: 3, y: 3 }, dna({ consume: 'Sun' }));
    sim.step();
    const state = JSON.parse(JSON.stringify(sim.toState()));

    const restored = Simulation.fromState(state);
    expect(restored.settings).toEqual(settings);
    expect(restored.tickCount).toBe(sim.tickCount);
    expect(restored.totalBirths).toBe(sim.totalBirths);
    expect(restored.totalDeaths).toBe(sim.totalDeaths);
    expect(restored.grid.entities()).toEqual(sim.grid.entities());
  });

  it('resumes ticking byte-for-byte identically to the original after a save/load round-trip', () => {
    const settings = testSettings({ width: 12, height: 12 });
    const original = new Simulation(settings, new SeededRNG(99));
    for (let i = 0; i < 15; i++) original.spawnRandomOrganic();
    for (let t = 0; t < 10; t++) original.step();

    // Simulates the actual localStorage/file path: serialize to a string, parse it back.
    const state = JSON.parse(JSON.stringify(original.toState()));
    const restored = Simulation.fromState(state);

    for (let t = 0; t < 20; t++) {
      original.step();
      restored.step();
    }

    expect(restored.grid.entities()).toEqual(original.grid.entities());
    expect(restored.tickCount).toBe(original.tickCount);
    expect(restored.totalBirths).toBe(original.totalBirths);
    expect(restored.totalDeaths).toBe(original.totalDeaths);
  });

  it("preserves the id counter so ids assigned after restore don't collide with the snapshot's entities", () => {
    const sim = new Simulation(testSettings(), new SeededRNG(3));
    const first = sim.spawnOrganicAt({ x: 0, y: 0 }, dna());
    const second = sim.spawnOrganicAt({ x: 1, y: 1 }, dna());
    const state = sim.toState();

    const restored = Simulation.fromState(state);
    const third = restored.spawnOrganicAt({ x: 2, y: 2 }, dna());

    expect(third?.id).not.toBe(first?.id);
    expect(third?.id).not.toBe(second?.id);
  });
});
