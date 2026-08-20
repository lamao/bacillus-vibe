import { RNG, pick } from './rng';
import { ALL_SUBSTANCES, DNA, PHYSICAL_SUBSTANCES, Substance } from './types';

/** Traits that mutate independently; each is picked with equal probability when a mutation occurs. */
const MUTABLE_TRAITS = ['body', 'consume', 'produce', 'toxin', 'canMove'] as const;
type MutableTrait = (typeof MUTABLE_TRAITS)[number];

export function randomPhysicalSubstance(rng: RNG): Substance {
  return pick(rng, PHYSICAL_SUBSTANCES);
}

export function randomConsumeSubstance(rng: RNG): Substance {
  return pick(rng, ALL_SUBSTANCES);
}

export function randomDNA(rng: RNG): DNA {
  return {
    body: randomPhysicalSubstance(rng),
    consume: randomConsumeSubstance(rng),
    produce: randomPhysicalSubstance(rng),
    toxin: randomPhysicalSubstance(rng),
    canMove: rng.next() < 0.5,
  };
}

/**
 * Returns the offspring DNA for a reproduction event: an exact copy of `parent`,
 * unless a `mutationRate` roll succeeds, in which case exactly one randomly
 * chosen trait is re-randomized.
 */
export function mutateDNA(parent: DNA, rng: RNG, mutationRate: number): DNA {
  const child: DNA = { ...parent };
  if (rng.next() >= mutationRate) {
    return child;
  }
  const trait: MutableTrait = pick(rng, MUTABLE_TRAITS);
  switch (trait) {
    case 'body':
      child.body = randomPhysicalSubstance(rng);
      break;
    case 'consume':
      child.consume = randomConsumeSubstance(rng);
      break;
    case 'produce':
      child.produce = randomPhysicalSubstance(rng);
      break;
    case 'toxin':
      child.toxin = randomPhysicalSubstance(rng);
      break;
    case 'canMove':
      child.canMove = rng.next() < 0.5;
      break;
  }
  return child;
}
