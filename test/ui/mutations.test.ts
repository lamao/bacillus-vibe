import { describe, expect, it } from 'vitest';
import { Entity } from '../../src/engine/types';
import { computeMutationStats, ZERO_MUTATION_STATS } from '../../src/ui/mutations';
import { dna, mineral, organic } from '../engine/fixtures';

describe('computeMutationStats', () => {
  it('returns zero stats for an empty entity list', () => {
    expect(computeMutationStats([])).toEqual(ZERO_MUTATION_STATS);
  });

  it('returns zero stats when only minerals are present', () => {
    const entities: Entity[] = [mineral({ x: 0, y: 0 }, 'Red', 100)];
    expect(computeMutationStats(entities)).toEqual(ZERO_MUTATION_STATS);
  });

  it('averages and maxes each counter across organics only', () => {
    const entities: Entity[] = [
      organic({ x: 0, y: 0 }, { dna: dna({ instructionMutations: 2, traitMutations: 1 }) }),
      organic({ x: 1, y: 0 }, { dna: dna({ instructionMutations: 6, traitMutations: 9 }) }),
      mineral({ x: 2, y: 0 }, 'Red', 100),
    ];
    const result = computeMutationStats(entities);
    expect(result.avgInstructionMutations).toBeCloseTo(4);
    expect(result.maxInstructionMutations).toBe(6);
    expect(result.avgTraitMutations).toBeCloseTo(5);
    expect(result.maxTraitMutations).toBe(9);
  });

  it('handles a single organic (average and max both equal its own counts)', () => {
    const entities: Entity[] = [organic({ x: 0, y: 0 }, { dna: dna({ instructionMutations: 3, traitMutations: 7 }) })];
    const result = computeMutationStats(entities);
    expect(result.avgInstructionMutations).toBe(3);
    expect(result.maxInstructionMutations).toBe(3);
    expect(result.avgTraitMutations).toBe(7);
    expect(result.maxTraitMutations).toBe(7);
  });
});
