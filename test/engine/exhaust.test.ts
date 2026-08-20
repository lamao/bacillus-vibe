import { describe, expect, it } from 'vitest';
import { exhaust } from '../../src/engine/phases';
import { emptyGrid, mineral, organic, place, testSettings } from './fixtures';

describe('exhaust (phase 7)', () => {
  it('applies PermanentConsumption and ages every organic', () => {
    const settings = testSettings({ permanentConsumption: 10 });
    const grid = emptyGrid(settings);
    const a = organic({ x: 1, y: 1 }, { energy: 500, age: 3 });
    const b = organic({ x: 2, y: 2 }, { energy: 5, age: 0 });
    place(grid, a, b);
    exhaust(grid, settings);
    expect(a.energy).toBe(490);
    expect(a.age).toBe(4);
    expect(b.energy).toBe(-5);
    expect(b.age).toBe(1);
  });

  it('degrades every mineral by MineralDegradation', () => {
    const settings = testSettings({ mineralDegradation: 3 });
    const grid = emptyGrid(settings);
    const m = mineral({ x: 1, y: 1 }, 'Blue', 10);
    place(grid, m);
    exhaust(grid, settings);
    expect(m.size).toBe(7);
  });

  it('is a no-op on an empty grid', () => {
    const settings = testSettings();
    const grid = emptyGrid(settings);
    expect(() => exhaust(grid, settings)).not.toThrow();
  });
});
