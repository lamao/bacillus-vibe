import { Entity, Organic } from '../engine/types';

/** Population-wide mutation load (#80): average and max of each DNA mutation counter across the current population. */
export interface MutationStats {
  avgInstructionMutations: number;
  maxInstructionMutations: number;
  avgTraitMutations: number;
  maxTraitMutations: number;
}

export const ZERO_MUTATION_STATS: MutationStats = {
  avgInstructionMutations: 0,
  maxInstructionMutations: 0,
  avgTraitMutations: 0,
  maxTraitMutations: 0,
};

/** Averages and maxes `dna.instructionMutations`/`traitMutations` across the population, so drift is visible without inspecting individual cells. */
export function computeMutationStats(entities: readonly Entity[]): MutationStats {
  const organics = entities.filter((entity): entity is Organic => entity.kind === 'organic');
  if (organics.length === 0) return ZERO_MUTATION_STATS;

  let instructionSum = 0;
  let traitSum = 0;
  let instructionMax = 0;
  let traitMax = 0;
  for (const organic of organics) {
    instructionSum += organic.dna.instructionMutations;
    traitSum += organic.dna.traitMutations;
    instructionMax = Math.max(instructionMax, organic.dna.instructionMutations);
    traitMax = Math.max(traitMax, organic.dna.traitMutations);
  }
  return {
    avgInstructionMutations: instructionSum / organics.length,
    maxInstructionMutations: instructionMax,
    avgTraitMutations: traitSum / organics.length,
    maxTraitMutations: traitMax,
  };
}
