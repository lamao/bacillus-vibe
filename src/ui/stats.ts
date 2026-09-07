import { ALL_SUBSTANCES, Entity, Organic, PHYSICAL_SUBSTANCES, Substance } from '../engine/types';

export interface StatCounts {
  total: number;
  minerals: number;
  bySubstance: Map<Substance, number>;
  byConsume: Map<Substance, number>;
  byProduce: Map<Substance, number>;
  byToxin: Map<Substance, number>;
}

/**
 * Tallies organics by whichever DNA substance field `pick` selects, zero-filled over
 * `domain` so a substance that drops to zero still reports 0 rather than vanishing from
 * the map (and, downstream, from the stats bar/header labels that read it).
 */
function tallyBy(organics: readonly Organic[], domain: readonly Substance[], pick: (organic: Organic) => Substance): Map<Substance, number> {
  const counts = new Map<Substance, number>(domain.map((substance) => [substance, 0]));
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
    bySubstance: tallyBy(organics, PHYSICAL_SUBSTANCES, (organic) => organic.dna.body),
    byConsume: tallyBy(organics, ALL_SUBSTANCES, (organic) => organic.dna.consume),
    byProduce: tallyBy(organics, PHYSICAL_SUBSTANCES, (organic) => organic.dna.produce),
    byToxin: tallyBy(organics, PHYSICAL_SUBSTANCES, (organic) => organic.dna.toxin),
  };
}
