import { describe, expect, it } from 'vitest';
import { Entity } from '../../src/engine/types';
import { computeStatCounts } from '../../src/ui/stats';
import { dna, mineral, organic } from '../engine/fixtures';

describe('computeStatCounts', () => {
  it('zero-fills every substance (so a substance with no organics reports 0, not absence) for an empty entity list', () => {
    expect(computeStatCounts([])).toEqual({
      total: 0,
      minerals: 0,
      bySubstance: new Map([
        ['Blue', 0],
        ['Green', 0],
        ['Yellow', 0],
        ['White', 0],
        ['Red', 0],
      ]),
      byConsume: new Map([
        ['Sun', 0],
        ['Blue', 0],
        ['Green', 0],
        ['Yellow', 0],
        ['White', 0],
        ['Red', 0],
      ]),
      byProduce: new Map([
        ['Blue', 0],
        ['Green', 0],
        ['Yellow', 0],
        ['White', 0],
        ['Red', 0],
      ]),
      byToxin: new Map([
        ['Blue', 0],
        ['Green', 0],
        ['Yellow', 0],
        ['White', 0],
        ['Red', 0],
      ]),
    });
  });

  it('counts organics, minerals, and per-body-substance breakdown separately, zero-filling absent substances', () => {
    const entities: Entity[] = [
      organic({ x: 0, y: 0 }, { dna: dna({ body: 'Blue' }) }),
      organic({ x: 1, y: 0 }, { dna: dna({ body: 'Blue' }) }),
      organic({ x: 2, y: 0 }, { dna: dna({ body: 'Green' }) }),
      mineral({ x: 3, y: 0 }, 'Red', 100),
      mineral({ x: 4, y: 0 }, 'Red', 100),
    ];
    const counts = computeStatCounts(entities);
    expect(counts.total).toBe(3);
    expect(counts.minerals).toBe(2);
    expect(counts.bySubstance).toEqual(
      new Map([
        ['Blue', 2],
        ['Green', 1],
        ['Yellow', 0],
        ['White', 0],
        ['Red', 0],
      ]),
    );
  });

  it('counts organics per consume/produce/toxin substance separately from body, zero-filling absent substances', () => {
    const entities: Entity[] = [
      organic({ x: 0, y: 0 }, { dna: dna({ body: 'Blue', consume: 'Sun', produce: 'Green', toxin: 'Red' }) }),
      organic({ x: 1, y: 0 }, { dna: dna({ body: 'Green', consume: 'Sun', produce: 'Yellow', toxin: 'Red' }) }),
      organic({ x: 2, y: 0 }, { dna: dna({ body: 'Yellow', consume: 'Green', produce: 'Yellow', toxin: 'White' }) }),
    ];
    const counts = computeStatCounts(entities);
    expect(counts.byConsume).toEqual(
      new Map([
        ['Sun', 2],
        ['Blue', 0],
        ['Green', 1],
        ['Yellow', 0],
        ['White', 0],
        ['Red', 0],
      ]),
    );
    expect(counts.byProduce).toEqual(
      new Map([
        ['Blue', 0],
        ['Green', 1],
        ['Yellow', 2],
        ['White', 0],
        ['Red', 0],
      ]),
    );
    expect(counts.byToxin).toEqual(
      new Map([
        ['Blue', 0],
        ['Green', 0],
        ['Yellow', 0],
        ['White', 1],
        ['Red', 2],
      ]),
    );
  });
});
