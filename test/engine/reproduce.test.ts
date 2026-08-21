import { describe, expect, it } from 'vitest';
import { reproduce } from '../../src/engine/phases';
import { dna, emptyGrid, organic, place, testSettings } from './fixtures';
import { MockRNG } from './mockRng';

function idGen(): () => number {
  let n = 0;
  return () => n++;
}

const split = { type: 'Split' as const, mode: 'Attempt' as const };

describe('reproduce (phase 3)', () => {
  it('ignores organics below the reproduction threshold', () => {
    const settings = testSettings({ reproductionThreshold: 2000 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { energy: 1999, size: 1000, chosenAction: split });
    place(grid, o);
    reproduce(grid, settings, new MockRNG([0.5, 0.5, 0.5]), idGen());
    expect(o.energy).toBe(1999);
    expect(o.size).toBe(1000);
    expect(grid.entities()).toHaveLength(1);
  });

  it("ignores organics whose chosen action isn't Split, even above the reproduction threshold", () => {
    const settings = testSettings({ reproductionThreshold: 2000 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { energy: 2000, size: 1000, chosenAction: { type: 'Rest' } });
    place(grid, o);
    reproduce(grid, settings, new MockRNG([0.5, 0.5, 0.5]), idGen());
    expect(o.energy).toBe(2000);
    expect(o.size).toBe(1000);
    expect(grid.entities()).toHaveLength(1);
  });

  it('spawns an offspring in a free cell, deducting spent energy and size from the parent', () => {
    const settings = testSettings({
      reproductionThreshold: 2000,
      defaultSize: 750,
      reproductionRange: 1,
      mutationRate: 0.01,
    });
    const grid = emptyGrid(settings);
    const parent = organic({ x: 5, y: 5 }, { energy: 2000, size: 1000, dna: dna({ body: 'Blue' }), chosenAction: split });
    place(grid, parent);
    // next() sequence: 0.5 -> spent factor (1 + (0.5*0.5-0.25)) = 1 -> spent=750
    //                  0.5 -> offset index floor(0.5*8)=4 -> (1,0)
    //                  0.9 -> mutation roll, 0.9 >= 0.01 -> no mutation
    reproduce(grid, settings, new MockRNG([0.5, 0.5, 0.9]), idGen());

    expect(parent.energy).toBe(1250);
    expect(parent.size).toBe(250);

    const offspring = grid.get(6, 5);
    expect(offspring).not.toBeNull();
    expect(offspring?.kind).toBe('organic');
    if (offspring?.kind === 'organic') {
      expect(offspring.size).toBe(750);
      expect(offspring.energy).toBe(750);
      expect(offspring.age).toBe(0);
      expect(offspring.accumulatedWaste).toBe(0);
      expect(offspring.direction).toBeNull();
      expect(offspring.dna).toEqual(parent.dna);
      expect(offspring.id).not.toBe(parent.id);
    }
  });

  it('refunds a fraction of spent energy when the target cell is occupied', () => {
    const settings = testSettings({
      reproductionThreshold: 2000,
      defaultSize: 750,
      reproductionRange: 1,
      returnHealthWhenReproductionFails: 0.5,
    });
    const grid = emptyGrid(settings);
    const parent = organic({ x: 5, y: 5 }, { energy: 2000, size: 1000, chosenAction: split });
    const blocker = organic({ x: 6, y: 5 }, { energy: 100, size: 100 });
    place(grid, parent, blocker);
    reproduce(grid, settings, new MockRNG([0.5, 0.5, 0.9]), idGen());

    // spent = 750; failed placement -> refund 750*0.5 = 375
    expect(parent.energy).toBe(2000 - 750 + 375);
    expect(parent.size).toBe(1000); // unchanged on failure
    expect(grid.get(6, 5)).toBe(blocker); // untouched
  });

  it('refunds when the chosen offset would leave the grid', () => {
    const settings = testSettings({ reproductionThreshold: 2000, defaultSize: 750, returnHealthWhenReproductionFails: 0.5 });
    const grid = emptyGrid(settings);
    const parent = organic({ x: 0, y: 0 }, { energy: 2000, size: 1000, chosenAction: split });
    place(grid, parent);
    // offset index 0 -> (-1,-1) from (0,0) is off-grid
    reproduce(grid, settings, new MockRNG([0.5, 0, 0.9]), idGen());

    expect(parent.energy).toBe(2000 - 750 + 375);
    expect(parent.size).toBe(1000);
  });

  it('mutates the offspring DNA when the mutation roll succeeds', () => {
    const settings = testSettings({ reproductionThreshold: 2000, defaultSize: 750, mutationRate: 1 });
    const grid = emptyGrid(settings);
    const parent = organic({ x: 5, y: 5 }, { energy: 2000, size: 1000, dna: dna({ body: 'Blue' }), chosenAction: split });
    place(grid, parent);
    // spent=0.5->750; offset=0.5->(1,0); mutation roll 0 (< rate 1) -> mutate;
    // trait pick 0 -> 'body'; substance pick 0.3 -> 'Green' (differs from parent's 'Blue')
    reproduce(grid, settings, new MockRNG([0.5, 0.5, 0, 0, 0.3]), idGen());

    const offspring = grid.get(6, 5);
    expect(offspring?.kind).toBe('organic');
    if (offspring?.kind === 'organic') {
      expect(offspring.dna.body).toBe('Green');
    }
  });

  it('processes multiple eligible organics independently with distinct ids', () => {
    const settings = testSettings({ reproductionThreshold: 2000, defaultSize: 750, mutationRate: 0 });
    const grid = emptyGrid(settings);
    const a = organic({ x: 1, y: 1 }, { energy: 2000, size: 1000, chosenAction: split });
    const b = organic({ x: 8, y: 8 }, { energy: 2000, size: 1000, chosenAction: split });
    place(grid, a, b);
    const rng = new MockRNG([0.5, 0.5, 0.9]);
    const ids = idGen();
    reproduce(grid, settings, rng, ids);

    expect(grid.get(2, 1)?.kind).toBe('organic');
    expect(grid.get(9, 8)?.kind).toBe('organic');
    const offA = grid.get(2, 1);
    const offB = grid.get(9, 8);
    if (offA?.kind === 'organic' && offB?.kind === 'organic') {
      expect(offA.id).not.toBe(offB.id);
    }
  });
});
