import { pick, pickExcluding, RNG } from './rng';
import {
  ALL_SUBSTANCES,
  Action,
  Comparator,
  DNA,
  INSTRUCTION_MATRIX_SIZE,
  Instruction,
  InstructionMatrix,
  MoveMode,
  PHYSICAL_SUBSTANCES,
  ProduceMode,
  Sensor,
  Substance,
} from './types';

/** The 4 point traits, as opposed to `behavior` (the instruction matrix), each picked with equal probability once a mutation is decided to target a point trait rather than behavior. */
const POINT_TRAITS = ['body', 'consume', 'produce', 'toxin'] as const;
type PointTrait = (typeof POINT_TRAITS)[number];

export function randomPhysicalSubstance(rng: RNG): Substance {
  return pick(rng, PHYSICAL_SUBSTANCES);
}

export function randomConsumeSubstance(rng: RNG): Substance {
  return pick(rng, ALL_SUBSTANCES);
}

/**
 * `behavior` defaults to the hardcoded starter genome per #5's "Resolved" decision —
 * mutation introduces behavioral variety from there. Callers that want a population
 * seeded with fully randomized behavior instead (e.g. the "Wild genomes" scenario
 * preset, #32) can pass {@link randomInstructionMatrix}'s output explicitly.
 */
export function randomDNA(rng: RNG, behavior: InstructionMatrix = starterInstructionMatrix()): DNA {
  return {
    body: randomPhysicalSubstance(rng),
    consume: randomConsumeSubstance(rng),
    produce: randomPhysicalSubstance(rng),
    toxin: randomPhysicalSubstance(rng),
    behavior,
    // Founding organics are generation zero — this DNA wasn't produced by a mutation.
    instructionMutations: 0,
    traitMutations: 0,
  };
}

/**
 * Returns the offspring DNA for a reproduction event: an exact copy of `parent`,
 * unless a `mutationRate` roll succeeds, in which case the mutation happens in two
 * steps — first deciding *what kind* of mutation this is, then *which* variable
 * within it changes:
 *
 * 1. A `behaviorMutationRatio` roll picks the mutation's category: the behavior/
 *    instruction matrix, or the point traits as a group. Splitting this out (rather
 *    than picking uniformly among all 5 traits including behavior, the original
 *    scheme) is what makes behavior mutation ratio independently tunable — turning
 *    it up drives faster behavioral adaptation without also having to raise the
 *    overall `mutationRate` (which would mutate the point traits faster too).
 * 2. Within whichever category was picked, one variable is chosen uniformly at
 *    random: one of the 4 point traits, or (for behavior) one instruction-matrix
 *    state and one mutation operator, exactly as before.
 *
 * The child's `instructionMutations`/`traitMutations` counters start as a copy of the
 * parent's and, when a mutation actually happens, exactly one of the two is
 * incremented — matching whichever category was picked (#80). Every mutation
 * operator below is guaranteed to change something (see the exclude-and-pick helpers
 * it calls), so a mutation event and a counter increment always go together.
 */
export function mutateDNA(parent: DNA, rng: RNG, mutationRate: number, behaviorMutationRatio: number): DNA {
  const child: DNA = { ...parent };
  if (rng.next() >= mutationRate) {
    return child;
  }
  if (rng.next() < behaviorMutationRatio) {
    child.behavior = mutateBehavior(parent.behavior, rng);
    child.instructionMutations = parent.instructionMutations + 1;
    return child;
  }
  child.traitMutations = parent.traitMutations + 1;
  const trait: PointTrait = pick(rng, POINT_TRAITS);
  switch (trait) {
    case 'body':
      child.body = pickExcluding(rng, PHYSICAL_SUBSTANCES, parent.body);
      break;
    case 'consume':
      child.consume = pickExcluding(rng, ALL_SUBSTANCES, parent.consume);
      break;
    case 'produce':
      child.produce = pickExcluding(rng, PHYSICAL_SUBSTANCES, parent.produce);
      break;
    case 'toxin':
      child.toxin = pickExcluding(rng, PHYSICAL_SUBSTANCES, parent.toxin);
      break;
  }
  return child;
}

const ACTION_CATEGORIES = ['Move', 'Produce', 'Split', 'Rest'] as const;
const MOVE_MODES: readonly MoveMode[] = ['TowardConsume', 'AwayFromToxin', 'TowardOpenSpace', 'Random', 'Hold'];
const PRODUCE_MODES: readonly ProduceMode[] = ['Release', 'Hold'];
const SENSORS: readonly Sensor[] = ['FoodDist', 'ToxinDist', 'EnergyRatio', 'SizeRatio', 'Age', 'Crowding', 'Random'];

/** Five operators, per #5 §5, each picked with equal probability (barring `rerollMode`'s exclusion below) and applied to exactly one state. */
const BEHAVIOR_MUTATION_OPERATORS = ['rerollAction', 'rerollMode', 'rerollSensor', 'nudgeThreshold', 'rerollJumpOffset'] as const;
type BehaviorMutationOperator = (typeof BEHAVIOR_MUTATION_OPERATORS)[number];

/** Standard deviation of the gaussian perturbation `nudgeThreshold` applies to a threshold. */
export const THRESHOLD_NUDGE_STDDEV = 0.15;

function randomAction(rng: RNG): Action {
  const category = pick(rng, ACTION_CATEGORIES);
  switch (category) {
    case 'Move':
      return { type: 'Move', mode: pick(rng, MOVE_MODES) };
    case 'Produce':
      return { type: 'Produce', mode: pick(rng, PRODUCE_MODES) };
    case 'Split':
      return { type: 'Split', mode: 'Attempt' };
    case 'Rest':
      return { type: 'Rest' };
  }
}

/** Every distinct concrete action value (5 Move modes + 2 Produce modes + Split + Rest = 9), for {@link applyBehaviorOperator}'s `rerollAction` to exclude-and-pick from so a reroll is guaranteed to actually change the action. */
const ALL_ACTIONS: readonly Action[] = [
  ...MOVE_MODES.map((mode): Action => ({ type: 'Move', mode })),
  ...PRODUCE_MODES.map((mode): Action => ({ type: 'Produce', mode })),
  { type: 'Split', mode: 'Attempt' },
  { type: 'Rest' },
];

function actionsEqual(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'Move' && b.type === 'Move') return a.mode === b.mode;
  if (a.type === 'Produce' && b.type === 'Produce') return a.mode === b.mode;
  return true; // Split (one mode) and Rest (no fields) always match once types match.
}

/** Whether `action`'s category has more than one mode to reroll into — Move and Produce do, Split and Rest don't. */
function hasAlternateMode(action: Action): boolean {
  return action.type === 'Move' || action.type === 'Produce';
}

/**
 * Operators available for mutating `instruction`: all 5, unless its action has no
 * alternate mode (Split/Rest), in which case `rerollMode` — which could only ever
 * reroll into what's already there — is filtered out so every mutation still lands
 * on an operator that can deliver a real change (#80).
 */
function operatorsFor(instruction: Instruction): readonly BehaviorMutationOperator[] {
  return hasAlternateMode(instruction.action)
    ? BEHAVIOR_MUTATION_OPERATORS
    : BEHAVIOR_MUTATION_OPERATORS.filter((op) => op !== 'rerollMode');
}

/** Keeps `action`'s category, picking a mode guaranteed to differ from its current one. Only called for Move/Produce — see {@link operatorsFor}. */
function rerollMode(action: Action, rng: RNG): Action {
  switch (action.type) {
    case 'Move':
      return { type: 'Move', mode: pickExcluding(rng, MOVE_MODES, action.mode) };
    case 'Produce':
      return { type: 'Produce', mode: pickExcluding(rng, PRODUCE_MODES, action.mode) };
    case 'Split':
    case 'Rest':
      return action;
  }
}

/** A standard-normal sample (Box-Muller) scaled by `stdDev`; clamps away from 0 to avoid -Infinity in the log. */
function gaussianNudge(rng: RNG, stdDev: number): number {
  const u1 = Math.max(rng.next(), Number.EPSILON);
  const u2 = rng.next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * stdDev;
}

/** A fresh jump offset spanning the ring both ways; `wrapMatrixIndex` normalizes it wherever it's applied. */
function randomJumpOffset(rng: RNG): number {
  return rng.int(2 * INSTRUCTION_MATRIX_SIZE + 1) - INSTRUCTION_MATRIX_SIZE;
}

/** Every value a jump offset can take, for `rerollJumpOffset`'s exclude-and-pick. */
const JUMP_OFFSET_RANGE: readonly number[] = Array.from(
  { length: 2 * INSTRUCTION_MATRIX_SIZE + 1 },
  (_, i) => i - INSTRUCTION_MATRIX_SIZE,
);

const COMPARATORS: readonly Comparator[] = ['<', '>='];

/** One fully-randomized instruction: action, sensor, comparator, threshold, and jump offset. */
function randomInstruction(rng: RNG): Instruction {
  return {
    action: randomAction(rng),
    sensor: pick(rng, SENSORS),
    comparator: pick(rng, COMPARATORS),
    threshold: rng.next(),
    jumpOffset: randomJumpOffset(rng),
  };
}

/**
 * A full 25-state instruction matrix of independently randomized instructions — unlike
 * {@link starterInstructionMatrix}, not hand-tuned, so a population seeded with it starts
 * from unproven "program soup" behavior rather than the vetted starter genome.
 */
export function randomInstructionMatrix(rng: RNG): InstructionMatrix {
  return Array.from({ length: INSTRUCTION_MATRIX_SIZE }, () => randomInstruction(rng));
}

function applyBehaviorOperator(operator: BehaviorMutationOperator, instruction: Instruction, rng: RNG): Instruction {
  switch (operator) {
    case 'rerollAction':
      return { ...instruction, action: pickExcluding(rng, ALL_ACTIONS, instruction.action, actionsEqual) };
    case 'rerollMode':
      return { ...instruction, action: rerollMode(instruction.action, rng) };
    case 'rerollSensor':
      return { ...instruction, sensor: pickExcluding(rng, SENSORS, instruction.sensor) };
    case 'nudgeThreshold':
      return { ...instruction, threshold: instruction.threshold + gaussianNudge(rng, THRESHOLD_NUDGE_STDDEV) };
    case 'rerollJumpOffset':
      return { ...instruction, jumpOffset: pickExcluding(rng, JUMP_OFFSET_RANGE, instruction.jumpOffset) };
  }
}

/** Applies one randomly chosen mutation operator (per #5 §5) to exactly one randomly chosen state. */
function mutateBehavior(behavior: InstructionMatrix, rng: RNG): InstructionMatrix {
  const stateIndex = rng.int(INSTRUCTION_MATRIX_SIZE);
  const operator = pick(rng, operatorsFor(behavior[stateIndex]));
  const next = [...behavior];
  next[stateIndex] = applyBehaviorOperator(operator, next[stateIndex], rng);
  return next;
}

/**
 * The single hand-built starter genome copied into every organic in the initial
 * population (see #5's "Resolved" decision — not random, mutation introduces
 * variety from here).
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
