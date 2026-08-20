import { describe, expect, it } from 'vitest';
import { moveOrganics } from '../../src/engine/phases';
import { dna, emptyGrid, mineral, organic, place, testSettings } from './fixtures';

describe('moveOrganics (phase 2)', () => {
  it('does nothing to organics without a direction', () => {
    const settings = testSettings();
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { direction: null, energy: 500 });
    place(grid, o);
    moveOrganics(grid, settings);
    expect(o.energy).toBe(500);
    expect(o.position).toEqual({ x: 5, y: 5 });
  });

  it('does nothing to non-movers even if a direction is somehow set', () => {
    const settings = testSettings();
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { dna: dna({ canMove: false }), direction: { x: 1, y: 0 }, energy: 500 });
    place(grid, o);
    moveOrganics(grid, settings);
    expect(o.energy).toBe(500);
    expect(o.position).toEqual({ x: 5, y: 5 });
  });

  it('relocates into a free target cell, paying MoveConsumption', () => {
    const settings = testSettings({ moveConsumption: 10 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { direction: { x: 1, y: 0 }, energy: 500 });
    place(grid, o);
    moveOrganics(grid, settings);
    expect(o.energy).toBe(490);
    expect(o.position).toEqual({ x: 6, y: 5 });
    expect(grid.get(5, 5)).toBeNull();
    expect(grid.get(6, 5)).toBe(o);
  });

  it('pays the move cost but stays out of bounds without throwing', () => {
    const settings = testSettings({ moveConsumption: 10 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 0, y: 0 }, { direction: { x: -1, y: 0 }, energy: 500 });
    place(grid, o);
    moveOrganics(grid, settings);
    expect(o.energy).toBe(490);
    expect(o.position).toEqual({ x: 0, y: 0 });
  });

  it('stays in place when blocked by a non-matching entity', () => {
    const settings = testSettings({ moveConsumption: 10 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { direction: { x: 1, y: 0 }, energy: 500, dna: dna({ consume: 'Green' }) });
    const blocker = mineral({ x: 6, y: 5 }, 'Red', 100);
    place(grid, o, blocker);
    moveOrganics(grid, settings);
    expect(o.energy).toBe(490);
    expect(o.position).toEqual({ x: 5, y: 5 });
    expect(grid.get(6, 5)).toBe(blocker);
    expect(blocker.size).toBe(100);
  });

  it('bites a matching-food entity instead of moving into it', () => {
    const settings = testSettings({ moveConsumption: 10, biteYield: 200, productionPerformance: 0.1 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, {
      direction: { x: 1, y: 0 },
      energy: 500,
      size: 1000,
      dna: dna({ consume: 'Green' }),
    });
    const food = mineral({ x: 6, y: 5 }, 'Green', 1000);
    place(grid, o, food);
    moveOrganics(grid, settings);

    expect(o.position).toEqual({ x: 5, y: 5 }); // stayed in place
    expect(food.size).toBe(800); // drained by biteYield
    // energy: 500 - moveConsumption(10) + gain(200*0.9=180) = 670
    expect(o.energy).toBe(670);
    expect(o.accumulatedWaste).toBeCloseTo(20); // 200 * 0.1
  });

  it('caps the bitten gain at maxSize, growing size but never past the cap', () => {
    const settings = testSettings({ moveConsumption: 0, biteYield: 200, productionPerformance: 0, maxSize: 1000 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, {
      direction: { x: 1, y: 0 },
      energy: 950,
      size: 950,
      dna: dna({ consume: 'Green' }),
    });
    const food = mineral({ x: 6, y: 5 }, 'Green', 1000);
    place(grid, o, food);
    moveOrganics(grid, settings);

    expect(o.size).toBe(1000); // 950 + 200 raw gain, capped at maxSize
    expect(o.energy).toBe(1000);
    expect(food.size).toBe(800);
  });

  it('drains only up to the target\'s remaining size', () => {
    const settings = testSettings({ moveConsumption: 0, biteYield: 200, productionPerformance: 0 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { direction: { x: 1, y: 0 }, energy: 0, size: 1000, dna: dna({ consume: 'Green' }) });
    const food = mineral({ x: 6, y: 5 }, 'Green', 50);
    place(grid, o, food);
    moveOrganics(grid, settings);

    expect(food.size).toBe(0);
    expect(o.energy).toBe(50);
  });

  it('bites a matching-food organic, reducing its size and clamping its energy', () => {
    const settings = testSettings({ moveConsumption: 0, biteYield: 200, productionPerformance: 0 });
    const grid = emptyGrid(settings);
    const hunter = organic({ x: 5, y: 5 }, { direction: { x: 1, y: 0 }, energy: 0, size: 1000, dna: dna({ consume: 'Blue' }) });
    const prey = organic({ x: 6, y: 5 }, { dna: dna({ body: 'Blue' }), size: 150, energy: 150 });
    place(grid, hunter, prey);
    moveOrganics(grid, settings);

    expect(prey.size).toBe(0);
    expect(prey.energy).toBe(0);
    expect(hunter.energy).toBe(150);
  });
});
