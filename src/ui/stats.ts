import { Entity, Organic, Substance } from '../engine/types';

export interface StatCounts {
  total: number;
  minerals: number;
  bySubstance: Map<Substance, number>;
  byConsume: Map<Substance, number>;
  byProduce: Map<Substance, number>;
  byToxin: Map<Substance, number>;
}

/** Tallies organics by whichever DNA substance field `pick` selects. */
function tallyBy(organics: readonly Organic[], pick: (organic: Organic) => Substance): Map<Substance, number> {
  const counts = new Map<Substance, number>();
  for (const organic of organics) {
    const substance = pick(organic);
    counts.set(substance, (counts.get(substance) ?? 0) + 1);
  }
  return counts;
}

/** Tallies organics (total + per body/consume/produce/toxin substance) and minerals from a grid's entity list. */
export function computeStatCounts(entities: readonly Entity[]): StatCounts {
  const organics = entities.filter((entity): entity is Organic => entity.kind === 'organic');
  const minerals = entities.filter((entity) => entity.kind === 'mineral').length;
  return {
    total: organics.length,
    minerals,
    bySubstance: tallyBy(organics, (organic) => organic.dna.body),
    byConsume: tallyBy(organics, (organic) => organic.dna.consume),
    byProduce: tallyBy(organics, (organic) => organic.dna.produce),
    byToxin: tallyBy(organics, (organic) => organic.dna.toxin),
  };
}
