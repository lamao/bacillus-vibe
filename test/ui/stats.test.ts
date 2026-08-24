import { describe, expect, it } from 'vitest';
import { Entity } from '../../src/engine/types';
import { computeStatCounts } from '../../src/ui/stats';
import { dna, mineral, organic } from '../engine/fixtures';

describe('computeStatCounts', () => {
  it('returns zeroed counts for an empty entity list', () => {
    expect(computeStatCounts([])).toEqual({ total: 0, minerals: 0, bySubstance: new Map() });
  });

  it('counts organics, minerals, and per-body-substance breakdown separately', () => {
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
      ]),
    );
  });
});
