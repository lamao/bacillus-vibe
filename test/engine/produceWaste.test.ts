import { describe, expect, it } from 'vitest';
import { produceWaste } from '../../src/engine/phases';
import { dna, emptyGrid, mineral, organic, place, testSettings } from './fixtures';

describe('produceWaste (phase 5)', () => {
  it('does nothing when there is no accumulated waste', () => {
    const settings = testSettings();
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { accumulatedWaste: 0, energy: 500 });
    place(grid, o);
    produceWaste(grid, settings);
    expect(o.energy).toBe(500);
    expect(grid.entities()).toHaveLength(1);
  });

  it('tops up an existing matching mineral within ProductionRange', () => {
    const settings = testSettings({ productionRange: 1, maxSize: 2200 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { accumulatedWaste: 50, dna: dna({ produce: 'Yellow' }), energy: 500 });
    const dump = mineral({ x: 5, y: 6 }, 'Yellow', 100);
    place(grid, o, dump);
    produceWaste(grid, settings);
    expect(dump.size).toBe(150);
    expect(o.accumulatedWaste).toBe(0);
    expect(o.energy).toBe(500);
  });

  it('stops topping up minerals once the waste is fully placed', () => {
    const settings = testSettings({ productionRange: 1, maxSize: 2200 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { accumulatedWaste: 5, dna: dna({ produce: 'Yellow' }), energy: 500 });
    const first = mineral({ x: 5, y: 6 }, 'Yellow', 100);
    const second = mineral({ x: 6, y: 6 }, 'Yellow', 100);
    place(grid, o, first, second);
    produceWaste(grid, settings);

    expect(first.size).toBe(105);
    expect(second.size).toBe(100); // untouched: loop broke once waste ran out
    expect(o.accumulatedWaste).toBe(0);
  });

  it('spills remaining waste into new minerals in free cells once matching minerals are full', () => {
    const settings = testSettings({ productionRange: 1, maxSize: 110 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { accumulatedWaste: 50, dna: dna({ produce: 'Yellow' }), energy: 500 });
    const full = mineral({ x: 5, y: 6 }, 'Yellow', 100); // only 10 of room left
    place(grid, o, full);
    produceWaste(grid, settings);

    expect(full.size).toBe(110);
    expect(o.accumulatedWaste).toBe(0);
    expect(o.energy).toBe(500);

    const created = grid.entities().filter((e) => e !== o && e !== full);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ kind: 'mineral', substance: 'Yellow', size: 40 });
  });

  it('self-poisons the organic when waste cannot be placed anywhere', () => {
    const settings = testSettings({ productionRange: 1 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { accumulatedWaste: 50, dna: dna({ produce: 'Yellow' }), energy: 500 });
    place(grid, o);
    // Surround with unrelated organics so there are no free cells and no matching minerals.
    for (const p of grid.positionsInRange(5, 5, 1)) {
      place(grid, organic(p, { dna: dna({ body: 'Red' }) }));
    }
    produceWaste(grid, settings);
    expect(o.energy).toBe(450);
    expect(o.accumulatedWaste).toBe(0);
  });

  it('partially fills one new mineral (capped at maxSize) then self-poisons with the rest', () => {
    const settings = testSettings({ productionRange: 1, maxSize: 30 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { accumulatedWaste: 50, dna: dna({ produce: 'Yellow' }), energy: 500 });
    place(grid, o);
    // Occupy every neighbor except (6,6), which stays the sole free cell.
    for (const p of grid.positionsInRange(5, 5, 1)) {
      if (p.x === 6 && p.y === 6) continue;
      place(grid, organic(p, { dna: dna({ body: 'Red' }) }));
    }
    produceWaste(grid, settings);

    expect(grid.get(6, 6)).toMatchObject({ kind: 'mineral', substance: 'Yellow', size: 30 });
    expect(o.energy).toBe(480); // 50 - 30 placed = 20 self-poisoning
    expect(o.accumulatedWaste).toBe(0);
  });
});
