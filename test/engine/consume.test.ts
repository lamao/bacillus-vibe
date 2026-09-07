import { describe, expect, it } from 'vitest';
import { consume } from '../../src/engine/phases';
import { dna, emptyGrid, mineral, organic, place, testSettings } from './fixtures';

describe('consume (phase 4)', () => {
  it('grants SunYield to Sun-consumers regardless of chosen action or position', () => {
    const settings = testSettings({ sunYield: 25 });
    const grid = emptyGrid(settings);
    const mover = organic(
      { x: 1, y: 1 },
      { dna: dna({ consume: 'Sun' }), chosenAction: { type: 'Move', mode: 'TowardConsume' }, energy: 100, size: 1000 },
    );
    const stationary = organic(
      { x: 8, y: 8 },
      { dna: dna({ consume: 'Sun' }), chosenAction: { type: 'Rest' }, energy: 100, size: 1000 },
    );
    place(grid, mover, stationary);
    consume(grid, settings);
    expect(mover.energy).toBe(125);
    expect(stationary.energy).toBe(125);
  });

  it('caps Sun gain at maxSize, growing size when energy is already full', () => {
    const settings = testSettings({ sunYield: 25, maxSize: 1010 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 1, y: 1 }, { dna: dna({ consume: 'Sun' }), chosenAction: { type: 'Rest' }, energy: 1000, size: 1000 });
    place(grid, o);
    consume(grid, settings);
    expect(o.size).toBe(1010);
    expect(o.energy).toBe(1010);
  });

  it('does nothing for a Move-chosen organic with non-Sun consume (no passive digestion)', () => {
    const settings = testSettings();
    const grid = emptyGrid(settings);
    const mover = organic(
      { x: 5, y: 5 },
      { dna: dna({ consume: 'Green' }), chosenAction: { type: 'Move', mode: 'TowardConsume' }, energy: 500, size: 1000 },
    );
    const food = mineral({ x: 5, y: 6 }, 'Green', 1000);
    place(grid, mover, food);
    consume(grid, settings);
    expect(mover.energy).toBe(500);
    expect(mover.accumulatedWaste).toBe(0);
    expect(food.size).toBe(1000);
  });

  it('drains matching minerals within ConsumingRange when the chosen action is not Move, splitting gain/waste', () => {
    const settings = testSettings({ consumingRange: 2, mineralsYield: 10, productionPerformance: 0.1 });
    const grid = emptyGrid(settings);
    const o = organic(
      { x: 5, y: 5 },
      { dna: dna({ consume: 'Green' }), chosenAction: { type: 'Rest' }, energy: 500, size: 1000 },
    );
    const a = mineral({ x: 5, y: 6 }, 'Green', 100);
    const b = mineral({ x: 6, y: 6 }, 'Green', 100);
    const nonMatch = mineral({ x: 4, y: 4 }, 'Red', 100);
    place(grid, o, a, b, nonMatch);
    consume(grid, settings);

    expect(a.size).toBe(90);
    expect(b.size).toBe(90);
    expect(nonMatch.size).toBe(100);
    // raw = 10 + 10 = 20; waste = 2; gain = 18
    expect(o.energy).toBe(518);
    expect(o.accumulatedWaste).toBeCloseTo(2);
  });

  it('drains matching prey organics, clamping their energy to their reduced size', () => {
    const settings = testSettings({ consumingRange: 1, mineralsYield: 10, productionPerformance: 0 });
    const grid = emptyGrid(settings);
    const predator = organic(
      { x: 5, y: 5 },
      { dna: dna({ consume: 'Blue' }), chosenAction: { type: 'Rest' }, energy: 0, size: 1000 },
    );
    const prey = organic({ x: 5, y: 6 }, { dna: dna({ body: 'Blue' }), size: 5, energy: 5 });
    place(grid, predator, prey);
    consume(grid, settings);

    expect(prey.size).toBe(0);
    expect(prey.energy).toBe(0);
    expect(predator.energy).toBe(5);
  });

  it('does not drain out-of-range matches', () => {
    const settings = testSettings({ consumingRange: 1 });
    const grid = emptyGrid(settings);
    const o = organic(
      { x: 5, y: 5 },
      { dna: dna({ consume: 'Green' }), chosenAction: { type: 'Rest' }, energy: 500, size: 1000 },
    );
    const farFood = mineral({ x: 7, y: 7 }, 'Green', 100);
    place(grid, o, farFood);
    consume(grid, settings);
    expect(o.energy).toBe(500);
    expect(farFood.size).toBe(100);
  });
});
