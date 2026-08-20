import { describe, expect, it } from 'vitest';
import { Grid } from '../../src/engine/grid';
import { mineral, organic } from './fixtures';

describe('Grid', () => {
  it('starts empty and reports bounds correctly', () => {
    const grid = new Grid(3, 2);
    expect(grid.inBounds(0, 0)).toBe(true);
    expect(grid.inBounds(2, 1)).toBe(true);
    expect(grid.inBounds(3, 0)).toBe(false);
    expect(grid.inBounds(-1, 0)).toBe(false);
    expect(grid.get(1, 1)).toBeNull();
    expect(grid.isFree(1, 1)).toBe(true);
  });

  it('get/isFree return false/null out of bounds without throwing', () => {
    const grid = new Grid(3, 3);
    expect(grid.get(-1, 0)).toBeNull();
    expect(grid.isFree(5, 5)).toBe(false);
  });

  it('set is a no-op out of bounds', () => {
    const grid = new Grid(3, 3);
    const m = mineral({ x: -1, y: -1 }, 'Blue', 100);
    grid.set(-1, -1, m);
    expect(grid.entities()).toHaveLength(0);
  });

  it('set/get/clear round-trip an entity', () => {
    const grid = new Grid(3, 3);
    const m = mineral({ x: 1, y: 1 }, 'Blue', 100);
    grid.set(1, 1, m);
    expect(grid.get(1, 1)).toBe(m);
    expect(grid.isFree(1, 1)).toBe(false);
    grid.clear(1, 1);
    expect(grid.get(1, 1)).toBeNull();
  });

  it('moveEntity relocates and updates the entity position', () => {
    const grid = new Grid(3, 3);
    const o = organic({ x: 0, y: 0 });
    grid.set(0, 0, o);
    grid.moveEntity(o, { x: 2, y: 2 });
    expect(grid.get(0, 0)).toBeNull();
    expect(grid.get(2, 2)).toBe(o);
    expect(o.position).toEqual({ x: 2, y: 2 });
  });

  it('entities/organics/minerals partition the population by kind', () => {
    const grid = new Grid(3, 3);
    const o = organic({ x: 0, y: 0 });
    const m = mineral({ x: 1, y: 1 }, 'Red', 50);
    grid.set(0, 0, o);
    grid.set(1, 1, m);
    expect(grid.entities()).toHaveLength(2);
    expect(grid.organics()).toEqual([o]);
    expect(grid.minerals()).toEqual([m]);
  });

  it('positionsInRange excludes the center, clips to bounds, and sorts nearest-first', () => {
    const grid = new Grid(3, 3);
    const positions = grid.positionsInRange(0, 0, 1);
    expect(positions).not.toContainEqual({ x: 0, y: 0 });
    // corner at (0,0) with radius 1 only has 3 valid in-bounds neighbors
    expect(positions).toHaveLength(3);
    expect(positions).toEqual(expect.arrayContaining([
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]));
  });

  it('positionsInRange orders by increasing Chebyshev distance', () => {
    const grid = new Grid(11, 11);
    const positions = grid.positionsInRange(5, 5, 2);
    const distances = positions.map((p) => Math.max(Math.abs(p.x - 5), Math.abs(p.y - 5)));
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1]);
    }
  });

  it('entitiesInRange returns only occupied cells within range', () => {
    const grid = new Grid(5, 5);
    const near = organic({ x: 3, y: 2 });
    const far = organic({ x: 4, y: 4 });
    grid.set(3, 2, near);
    grid.set(4, 4, far);
    const found = grid.entitiesInRange({ x: 2, y: 2 }, 1);
    expect(found).toEqual([near]);
  });
});
