import { RNG, pick } from './rng';
import { ALL_SUBSTANCES, DNA, Instruction, InstructionMatrix, MoveMode, PHYSICAL_SUBSTANCES, Substance } from './types';

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

/**
 * The single hand-built starter genome copied into every organic in the initial
 * population (see #5's "Resolved" decision — not random, mutation introduces
 * variety from here). Not wired into `randomDNA`/seeding yet; that lands once the
 * interpreter phase actually reads `behavior` (#6).
 *
 * Roughly five loops chained by the ring's default "false -> current + 1" advance,
 * shortcut by "true" jumps into whichever loop the test calls for:
 *  - 0-4, 8-11, 19: hunt (Move TowardConsume), watching for toxin/food/crowding/
 *    energy/age conditions that hand off to the other loops.
 *  - 5-7: flee (Move AwayFromToxin) once toxin gets close, back to hunting once clear.
 *  - 12-14: rest (ambient digestion) once adjacent to food.
 *  - 15-18: attempt to split while energy stays high, back to hunting once it drops.
 *  - 20-22: release accumulated waste; 23: seek open space when crowded;
 *    24: wander randomly as a fallback, closing the ring back to state 0.
 */
export function starterInstructionMatrix(): InstructionMatrix {
  const move = (mode: MoveMode): Instruction['action'] => ({ type: 'Move', mode });
  const instructions: Instruction[] = [
    // Hunt: watch for toxin, food, crowding, fullness, and old age.
    { action: move('TowardConsume'), sensor: 'ToxinDist', comparator: '<', threshold: 2, jumpOffset: 5 },
    { action: move('TowardConsume'), sensor: 'FoodDist', comparator: '<', threshold: 1, jumpOffset: 11 },
    { action: move('TowardConsume'), sensor: 'Crowding', comparator: '>=', threshold: 3, jumpOffset: 18 },
    { action: move('TowardConsume'), sensor: 'EnergyRatio', comparator: '>=', threshold: 0.9, jumpOffset: 13 },
    { action: move('TowardConsume'), sensor: 'Age', comparator: '>=', threshold: 0.95, jumpOffset: 20 },
    // Flee: back off from toxin until clear, or rest if energy runs low mid-flee.
    { action: move('AwayFromToxin'), sensor: 'ToxinDist', comparator: '>=', threshold: 2, jumpOffset: 3 },
    { action: move('AwayFromToxin'), sensor: 'ToxinDist', comparator: '>=', threshold: 2, jumpOffset: 3 },
    { action: move('AwayFromToxin'), sensor: 'EnergyRatio', comparator: '<', threshold: 0.2, jumpOffset: 5 },
    // Hunt again, same watches as states 0-4.
    { action: move('TowardConsume'), sensor: 'ToxinDist', comparator: '<', threshold: 2, jumpOffset: -3 },
    { action: move('TowardConsume'), sensor: 'FoodDist', comparator: '<', threshold: 1, jumpOffset: 3 },
    { action: move('TowardConsume'), sensor: 'EnergyRatio', comparator: '>=', threshold: 0.9, jumpOffset: 5 },
    { action: move('TowardConsume'), sensor: 'Crowding', comparator: '>=', threshold: 3, jumpOffset: 9 },
    // Rest: digest ambiently while adjacent to food, until full, food's gone, or old age.
    { action: { type: 'Rest' }, sensor: 'EnergyRatio', comparator: '>=', threshold: 0.9, jumpOffset: 3 },
    { action: { type: 'Rest' }, sensor: 'FoodDist', comparator: '>=', threshold: 1, jumpOffset: -13 },
    { action: { type: 'Rest' }, sensor: 'Age', comparator: '>=', threshold: 0.95, jumpOffset: 10 },
    // Split: keep attempting while energy is high, move on once it's spent.
    { action: { type: 'Split', mode: 'Attempt' }, sensor: 'EnergyRatio', comparator: '>=', threshold: 0.9, jumpOffset: 2 },
    { action: { type: 'Split', mode: 'Attempt' }, sensor: 'EnergyRatio', comparator: '>=', threshold: 0.9, jumpOffset: 2 },
    { action: { type: 'Split', mode: 'Attempt' }, sensor: 'EnergyRatio', comparator: '>=', threshold: 0.5, jumpOffset: -2 },
    { action: { type: 'Split', mode: 'Attempt' }, sensor: 'EnergyRatio', comparator: '<', threshold: 0.3, jumpOffset: 2 },
    // Back to hunting, watching only for toxin before rejoining the main hunt loop.
    { action: move('TowardConsume'), sensor: 'ToxinDist', comparator: '<', threshold: 2, jumpOffset: -14 },
    // Produce: release waste until there's room, watching for old age or hunger too.
    { action: { type: 'Produce', mode: 'Release' }, sensor: 'Crowding', comparator: '<', threshold: 2, jumpOffset: -20 },
    { action: { type: 'Produce', mode: 'Release' }, sensor: 'Age', comparator: '>=', threshold: 0.95, jumpOffset: 3 },
    { action: { type: 'Produce', mode: 'Release' }, sensor: 'EnergyRatio', comparator: '<', threshold: 0.2, jumpOffset: -10 },
    // Seek open space once crowded, then wander at random as a fallback before the ring closes.
    { action: move('TowardOpenSpace'), sensor: 'Crowding', comparator: '<', threshold: 2, jumpOffset: 2 },
    { action: move('Random'), sensor: 'Random', comparator: '>=', threshold: 0.5, jumpOffset: 1 },
  ];
  return instructions;
}
