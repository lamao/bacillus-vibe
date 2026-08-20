import { describe, expect, it } from 'vitest';
import { applyToxin } from '../../src/engine/phases';
import { dna, emptyGrid, mineral, organic, place, testSettings } from './fixtures';

describe('applyToxin (phase 6)', () => {
  it('does nothing when no toxin sources are in range', () => {
    const settings = testSettings({ toxinRange: 2 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { dna: dna({ toxin: 'Red' }), energy: 500 });
    place(grid, o);
    applyToxin(grid, settings);
    expect(o.energy).toBe(500);
  });

  it('damages fully at distance 1 (amount / 2^0)', () => {
    const settings = testSettings({ toxinRange: 2 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { dna: dna({ toxin: 'Red' }), energy: 500 });
    const source = mineral({ x: 6, y: 5 }, 'Red', 40);
    place(grid, o, source);
    applyToxin(grid, settings);
    expect(o.energy).toBe(460);
  });

  it('halves damage at each additional distance step', () => {
    const settings = testSettings({ toxinRange: 2 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { dna: dna({ toxin: 'Red' }), energy: 500 });
    const source = mineral({ x: 7, y: 5 }, 'Red', 40); // distance 2 -> 40/2 = 20
    place(grid, o, source);
    applyToxin(grid, settings);
    expect(o.energy).toBe(480);
  });

  it('sums damage from multiple matching sources and ignores non-matching ones', () => {
    const settings = testSettings({ toxinRange: 2 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { dna: dna({ toxin: 'Red' }), energy: 500 });
    const near = mineral({ x: 6, y: 5 }, 'Red', 40); // distance 1 -> 40
    const far = mineral({ x: 7, y: 5 }, 'Red', 40); // distance 2 -> 20
    const nonMatch = mineral({ x: 5, y: 6 }, 'Blue', 999);
    place(grid, o, near, far, nonMatch);
    applyToxin(grid, settings);
    expect(o.energy).toBe(440);
  });

  it('ignores sources outside ToxinRange', () => {
    const settings = testSettings({ toxinRange: 1 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { dna: dna({ toxin: 'Red' }), energy: 500 });
    const outOfRange = mineral({ x: 7, y: 5 }, 'Red', 40);
    place(grid, o, outOfRange);
    applyToxin(grid, settings);
    expect(o.energy).toBe(500);
  });

  it('an organic can be a toxin source via its body substance', () => {
    const settings = testSettings({ toxinRange: 2 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { dna: dna({ toxin: 'Blue' }), energy: 500 });
    const source = organic({ x: 6, y: 5 }, { dna: dna({ body: 'Blue' }), size: 40 });
    place(grid, o, source);
    applyToxin(grid, settings);
    expect(o.energy).toBe(460);
  });
});
