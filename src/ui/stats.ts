import { Entity, Organic, Substance } from '../engine/types';

export interface StatCounts {
  total: number;
  minerals: number;
  bySubstance: Map<Substance, number>;
}

/** Tallies organics (total + per body-substance) and minerals from a grid's entity list. */
export function computeStatCounts(entities: readonly Entity[]): StatCounts {
  const organics = entities.filter((entity): entity is Organic => entity.kind === 'organic');
  const minerals = entities.filter((entity) => entity.kind === 'mineral').length;
  const bySubstance = new Map<Substance, number>();
  for (const organic of organics) {
    bySubstance.set(organic.dna.body, (bySubstance.get(organic.dna.body) ?? 0) + 1);
  }
  return { total: organics.length, minerals, bySubstance };
}
