import { describe, expect, it } from 'vitest';
import { cleanup } from '../../src/engine/phases';
import { dna, emptyGrid, mineral, organic, place, testSettings } from './fixtures';

describe('cleanup (phase 8)', () => {
  it('leaves a living organic (positive energy, under MaxAge) untouched', () => {
    const settings = testSettings({ maxAge: 1500 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { energy: 1, age: 1499 });
    place(grid, o);
    const deaths = cleanup(grid, settings);
    expect(grid.get(5, 5)).toBe(o);
    expect(deaths).toBe(0);
  });

  it('kills an organic with energy <= 0 and leaves a corpse mineral of its body substance', () => {
    const settings = testSettings();
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { energy: 0, size: 300, dna: dna({ body: 'White' }) });
    place(grid, o);
    const deaths = cleanup(grid, settings);
    expect(grid.get(5, 5)).toMatchObject({ kind: 'mineral', substance: 'White', size: 300 });
    expect(deaths).toBe(1);
  });

  it('kills an organic that reached MaxAge, even with positive energy', () => {
    const settings = testSettings({ maxAge: 1500 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { energy: 999, age: 1500, size: 100, dna: dna({ body: 'Red' }) });
    place(grid, o);
    const deaths = cleanup(grid, settings);
    expect(grid.get(5, 5)).toMatchObject({ kind: 'mineral', substance: 'Red', size: 100 });
    expect(deaths).toBe(1);
  });

  it('leaves no corpse when the dead organic has zero size', () => {
    const settings = testSettings();
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { energy: -10, size: 0 });
    place(grid, o);
    const deaths = cleanup(grid, settings);
    expect(grid.get(5, 5)).toBeNull();
    expect(deaths).toBe(1);
  });

  it('counts multiple deaths in one call and excludes minerals from the count', () => {
    const settings = testSettings();
    const grid = emptyGrid(settings);
    const a = organic({ x: 5, y: 5 }, { energy: -10, size: 0 });
    const b = organic({ x: 6, y: 5 }, { energy: 0, size: 100 });
    const alive = organic({ x: 7, y: 5 }, { energy: 1, age: 0 });
    const depleted = mineral({ x: 1, y: 1 }, 'Blue', 0);
    place(grid, a, b, alive, depleted);
    const deaths = cleanup(grid, settings);
    expect(deaths).toBe(2);
  });

  it('removes depleted minerals and keeps ones with remaining size', () => {
    const settings = testSettings();
    const grid = emptyGrid(settings);
    const depleted = mineral({ x: 1, y: 1 }, 'Blue', 0);
    const remaining = mineral({ x: 2, y: 2 }, 'Blue', 5);
    place(grid, depleted, remaining);
    const deaths = cleanup(grid, settings);
    expect(grid.get(1, 1)).toBeNull();
    expect(grid.get(2, 2)).toBe(remaining);
    expect(deaths).toBe(0);
  });
});
