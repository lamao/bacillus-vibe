import { describe, expect, it } from 'vitest';
import {
  THRESHOLD_NUDGE_STDDEV,
  mutateDNA,
  randomConsumeSubstance,
  randomDNA,
  randomInstructionMatrix,
  randomPhysicalSubstance,
  starterInstructionMatrix,
} from '../../src/engine/dna';
import { DNA, INSTRUCTION_MATRIX_SIZE, PHYSICAL_SUBSTANCES, wrapMatrixIndex } from '../../src/engine/types';
import { dna } from './fixtures';
import { MockRNG } from './mockRng';

describe('randomPhysicalSubstance / randomConsumeSubstance', () => {
  it('never returns Sun for a physical substance', () => {
    for (let i = 0; i < PHYSICAL_SUBSTANCES.length; i++) {
      const rng = new MockRNG([i / PHYSICAL_SUBSTANCES.length]);
      expect(randomPhysicalSubstance(rng)).not.toBe('Sun');
    }
  });

  it('can return Sun for a consume substance', () => {
    // ALL_SUBSTANCES = [Sun, Blue, Green, Yellow, White, Red]; index 0 is Sun.
    const rng = new MockRNG([0]);
    expect(randomConsumeSubstance(rng)).toBe('Sun');
  });
});

describe('randomDNA', () => {
  it('produces a fully-formed DNA object', () => {
    const rng = new MockRNG([0.1, 0.2, 0.3, 0.4]);
    const d = randomDNA(rng);
    expect(d.body).toBeDefined();
    expect(d.consume).toBeDefined();
    expect(d.produce).toBeDefined();
    expect(d.toxin).toBeDefined();
    expect(d.behavior).toEqual(starterInstructionMatrix());
  });

  it('starts a founding genome with both mutation counters at 0, since it is generation zero', () => {
    const rng = new MockRNG([0.1, 0.2, 0.3, 0.4]);
    const d = randomDNA(rng);
    expect(d.instructionMutations).toBe(0);
    expect(d.traitMutations).toBe(0);
  });

  it('uses a given behavior matrix instead of the starter one, when passed explicitly', () => {
    const rng = new MockRNG([0.1, 0.2, 0.3, 0.4]);
    const customBehavior = randomInstructionMatrix(new MockRNG([0.5]));
    const d = randomDNA(rng, customBehavior);
    expect(d.behavior).toBe(customBehavior);
  });
});

describe('randomInstructionMatrix', () => {
  it('produces a full 25-state matrix of well-formed instructions', () => {
    const rng = new MockRNG([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);
    const matrix = randomInstructionMatrix(rng);
    expect(matrix).toHaveLength(INSTRUCTION_MATRIX_SIZE);
    for (const instruction of matrix) {
      expect(instruction.action).toBeDefined();
      expect(['<', '>=']).toContain(instruction.comparator);
      expect(Number.isFinite(instruction.threshold)).toBe(true);
      expect(Number.isInteger(instruction.jumpOffset)).toBe(true);
    }
  });

  it('returns a fresh matrix each call, not a shared mutable reference', () => {
    const a = randomInstructionMatrix(new MockRNG([0.1, 0.2, 0.3]));
    const b = randomInstructionMatrix(new MockRNG([0.1, 0.2, 0.3]));
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe('mutateDNA', () => {
  it('returns an exact copy (not the same reference) when the mutation roll fails', () => {
    const parent = dna({ body: 'Blue', consume: 'Green', produce: 'Yellow', toxin: 'Red' });
    const rng = new MockRNG([0.5]); // 0.5 >= mutationRate(0.01) => no mutation; short-circuits before the category roll.
    const child = mutateDNA(parent, rng, 0.01, 0.2);
    expect(child).toEqual(parent);
    expect(child).not.toBe(parent);
  });

  // The remaining cases here pass behaviorMutationRatio=0, which forces the category
  // roll to always land on "point trait" (next() can never be < 0) regardless of the
  // value supplied for it — isolating the point-trait branch from the behavior one.

  it('mutates exactly one point trait when the mutation roll succeeds', () => {
    const parent = dna({ body: 'Blue', consume: 'Green', produce: 'Yellow', toxin: 'Red' });
    // next() sequence: [0] mutation roll (succeeds), [0] category roll (forced to
    // "point trait" by ratio=0, value irrelevant), [0] trait pick -> 'body' (4 point
    // traits, floor(0*4)=0), [0.3] new substance pick -> 'Yellow' (pool excludes 'Blue').
    const rng = new MockRNG([0, 0, 0, 0.3]);
    const child = mutateDNA(parent, rng, 1, 0);
    const traits: (keyof typeof parent)[] = ['body', 'consume', 'produce', 'toxin'];
    const changed = traits.filter((t) => child[t] !== parent[t]);
    expect(changed).toHaveLength(1);
  });

  it('mutating "body" never assigns Sun', () => {
    const parent = dna({ body: 'Blue' });
    // trait pick 0 -> 'body' (floor(0*4)=0); substance roll 0 -> first physical substance.
    const rng = new MockRNG([0, 0, 0, 0]);
    const child = mutateDNA(parent, rng, 1, 0);
    expect(child.body).not.toBe('Sun');
  });

  it('mutating "consume" can assign Sun', () => {
    const parent = dna({ consume: 'Green' });
    // trait pick 0.3 -> 'consume' (4 traits, floor(0.3*4)=1); substance roll 0 -> Sun.
    const rng = new MockRNG([0, 0, 0.3, 0]);
    const child = mutateDNA(parent, rng, 1, 0);
    expect(child.consume).toBe('Sun');
  });

  it('mutating "produce" never assigns Sun', () => {
    const parent = dna({ produce: 'Yellow' });
    // trait pick 0.5 -> 'produce' (4 traits, floor(0.5*4)=2).
    const rng = new MockRNG([0, 0, 0.5, 0.1]);
    const child = mutateDNA(parent, rng, 1, 0);
    expect(child.produce).not.toBe('Sun');
  });

  it('mutating "toxin" never assigns Sun', () => {
    const parent = dna({ toxin: 'Red' });
    // trait pick 0.75 -> 'toxin' (4 traits, floor(0.75*4)=3).
    const rng = new MockRNG([0, 0, 0.75, 0.1]);
    const child = mutateDNA(parent, rng, 1, 0);
    expect(child.toxin).not.toBe('Sun');
  });
});

describe('mutateDNA mutation counters (#80)', () => {
  it('copies both counters unchanged when the mutation roll fails', () => {
    const parent = dna({ instructionMutations: 4, traitMutations: 9 });
    const rng = new MockRNG([0.5]); // 0.5 >= mutationRate(0.01) => no mutation.
    const child = mutateDNA(parent, rng, 0.01, 0.2);
    expect(child.instructionMutations).toBe(4);
    expect(child.traitMutations).toBe(9);
  });

  it('increments only traitMutations, from whatever count the parent already carried, on a point-trait mutation', () => {
    const parent = dna({ body: 'Blue', instructionMutations: 4, traitMutations: 9 });
    // behaviorMutationRatio=0 forces the point-trait branch; trait pick 0 -> 'body'; substance pick 0 -> 'Green'.
    const rng = new MockRNG([0, 0, 0, 0]);
    const child = mutateDNA(parent, rng, 1, 0);
    expect(child.traitMutations).toBe(10);
    expect(child.instructionMutations).toBe(4);
  });

  it('increments only instructionMutations, from whatever count the parent already carried, on a behavior mutation', () => {
    const parent = dna({ behavior: starterInstructionMatrix(), instructionMutations: 4, traitMutations: 9 });
    // behaviorMutationRatio=1 forces the behavior branch; state pick 0, operator pick 0 -> 'rerollAction';
    // action pick 0 -> the pool's first entry once the starter's own action is excluded.
    const rng = new MockRNG([0, 0.9, 0, 0, 0]);
    const child = mutateDNA(parent, rng, 1, 1);
    expect(child.instructionMutations).toBe(5);
    expect(child.traitMutations).toBe(9);
  });
});

describe('mutateDNA "behavior" mutation operators', () => {
  // Every case below drives mutateDNA(parent, rng, 1, 1) with a parent using the
  // starter matrix. behaviorMutationRatio=1 forces the category roll to always land
  // on "behavior" (next() can never be >= 1), so its consumed value is a placeholder
  // that doesn't affect the outcome — only the state pick and operator pick after it
  // (lands on state 0, pick(0) -> floor(0*25)=0) determine what actually mutates.
  function behaviorParent(): DNA {
    return dna({ behavior: starterInstructionMatrix() });
  }

  function expectOnlyState0Changed(parent: DNA, child: DNA): void {
    for (let i = 1; i < INSTRUCTION_MATRIX_SIZE; i++) {
      expect(child.behavior[i]).toEqual(parent.behavior[i]);
    }
  }

  // rerollAction now excludes state 0's current action (Move/TowardConsume) from the
  // 9-action pool before picking, guaranteeing a real change; the starter's own action
  // is never a candidate, so the pool actually drawn from has 8 entries.
  it("rerollAction swaps state 0's action, guaranteed to differ, and can land on a different mode of the same category", () => {
    const parent = behaviorParent();
    // operator index 0 -> 'rerollAction' (pick(0) -> floor(0*5)=0);
    // action pick(0) -> floor(0*8)=0 -> 'AwayFromToxin', the pool's first entry once
    // 'TowardConsume' (the starter's current mode) is excluded.
    const rng = new MockRNG([0, 0.9, 0, 0, 0]);
    const child = mutateDNA(parent, rng, 1, 1);
    expect(child.behavior[0]).toEqual({ ...parent.behavior[0], action: { type: 'Move', mode: 'AwayFromToxin' } });
    expectOnlyState0Changed(parent, child);
  });

  // The 8-item pool (TowardConsume excluded): AwayFromToxin, TowardOpenSpace, Random,
  // Hold, Release, Hold, Split, Rest — indices 5-7 land on Produce/Hold, Split, and Rest
  // respectively; each case below only differs in which pool index the action pick lands on.
  it.each([
    { landsOn: 'Produce', pick: 0.7, expected: { type: 'Produce', mode: 'Hold' } },
    { landsOn: 'Split', pick: 0.8, expected: { type: 'Split', mode: 'Attempt' } },
    { landsOn: 'Rest', pick: 0.9, expected: { type: 'Rest' } },
  ])('rerollAction can land on $landsOn', ({ pick, expected }) => {
    const parent = behaviorParent();
    // operator index 0 -> 'rerollAction'; action pick(pick) -> floor(pick*8) into the pool above.
    const rng = new MockRNG([0, 0.9, 0, 0, pick]);
    const child = mutateDNA(parent, rng, 1, 1);
    expect(child.behavior[0]).toEqual({ ...parent.behavior[0], action: expected });
    expectOnlyState0Changed(parent, child);
  });

  it("rerollMode keeps state 0's Move category but picks a fresh mode, excluding the current one", () => {
    const parent = behaviorParent();
    // operator index 1 -> 'rerollMode' (pick(0.3) -> floor(0.3*5)=1);
    // mode pick(0.9) -> floor(0.9*4)=3 -> 'Hold' (starter's 'TowardConsume' excluded from the 4-mode pool).
    const rng = new MockRNG([0, 0.9, 0, 0.3, 0.9]);
    const child = mutateDNA(parent, rng, 1, 1);
    expect(child.behavior[0]).toEqual({ ...parent.behavior[0], action: { type: 'Move', mode: 'Hold' } });
    expectOnlyState0Changed(parent, child);
  });

  it("never selects rerollMode for a Split state, which has no alternate mode to reroll into", () => {
    const splitBehavior = starterInstructionMatrix().map((instruction, i) =>
      i === 0 ? { ...instruction, action: { type: 'Split' as const, mode: 'Attempt' as const } } : instruction,
    );
    const parent = dna({ behavior: splitBehavior });
    // Split has no alternate mode, so rerollMode is filtered out of the operator pool,
    // leaving ['rerollAction', 'rerollSensor', 'nudgeThreshold', 'rerollJumpOffset'] (4 items);
    // operator pick(0.3) -> floor(0.3*4)=1 -> 'rerollSensor' (index 1 in the full 5-operator
    // list would have been 'rerollMode' — proof the exclusion actually took effect);
    // sensor pick(0) -> floor(0*6)=0 -> 'FoodDist', the starter's own 'ToxinDist' excluded.
    const rng = new MockRNG([0, 0.9, 0, 0.3, 0]);
    const child = mutateDNA(parent, rng, 1, 1);
    expect(child.behavior[0]).toEqual({ ...parent.behavior[0], sensor: 'FoodDist' });
    expectOnlyState0Changed(parent, child);
  });

  it("rerollMode keeps state 0's Produce category but picks a fresh mode", () => {
    const produceBehavior = starterInstructionMatrix().map((instruction, i) =>
      i === 0 ? { ...instruction, action: { type: 'Produce' as const, mode: 'Release' as const } } : instruction,
    );
    const parent = dna({ behavior: produceBehavior });
    // operator index 1 -> 'rerollMode'; Produce has only 2 modes, so excluding 'Release'
    // leaves a single candidate ('Hold') regardless of the next roll's value.
    const rng = new MockRNG([0, 0.9, 0, 0.3, 0.9]);
    const child = mutateDNA(parent, rng, 1, 1);
    expect(child.behavior[0]).toEqual({ ...parent.behavior[0], action: { type: 'Produce', mode: 'Hold' } });
    expectOnlyState0Changed(parent, child);
  });

  it("rerollSensor swaps state 0's sensor, leaving its action and test values untouched", () => {
    const parent = behaviorParent();
    // operator index 2 -> 'rerollSensor' (pick(0.5) -> floor(0.5*5)=2);
    // sensor pick(0) -> floor(0*7)=0 -> 'FoodDist' (differs from the starter's 'ToxinDist').
    const rng = new MockRNG([0, 0.9, 0, 0.5, 0]);
    const child = mutateDNA(parent, rng, 1, 1);
    expect(child.behavior[0]).toEqual({ ...parent.behavior[0], sensor: 'FoodDist' });
    expectOnlyState0Changed(parent, child);
  });

  it("nudgeThreshold perturbs state 0's threshold by a small gaussian amount", () => {
    const parent = behaviorParent();
    // operator index 3 -> 'nudgeThreshold' (pick(0.7) -> floor(0.7*5)=3); Box-Muller draws u1=0.5, u2=0.
    const rng = new MockRNG([0, 0.9, 0, 0.7, 0.5, 0]);
    const child = mutateDNA(parent, rng, 1, 1);
    const expectedNudge = Math.sqrt(-2 * Math.log(0.5)) * Math.cos(0) * THRESHOLD_NUDGE_STDDEV;
    expect(child.behavior[0].threshold).toBeCloseTo(parent.behavior[0].threshold + expectedNudge, 10);
    expect(child.behavior[0]).toMatchObject({ action: parent.behavior[0].action, sensor: parent.behavior[0].sensor });
    expectOnlyState0Changed(parent, child);
  });

  it("rerollJumpOffset replaces state 0's jump offset with a fresh value spanning the ring both ways", () => {
    const parent = behaviorParent();
    // operator index 4 -> 'rerollJumpOffset' (pick(0.9) -> floor(0.9*5)=4);
    // offset pick(0) -> floor(0*51)-25 = -25.
    const rng = new MockRNG([0, 0.9, 0, 0.9, 0]);
    const child = mutateDNA(parent, rng, 1, 1);
    expect(child.behavior[0]).toEqual({ ...parent.behavior[0], jumpOffset: -25 });
    expectOnlyState0Changed(parent, child);
  });

  it('mutating "behavior" returns a fresh array, leaving the parent matrix untouched', () => {
    const parent = behaviorParent();
    const rng = new MockRNG([0, 0.9, 0, 0, 0.9]);
    const child = mutateDNA(parent, rng, 1, 1);
    expect(child.behavior).not.toBe(parent.behavior);
    expect(parent.behavior[0]).toEqual(starterInstructionMatrix()[0]);
  });
});

describe('mutateDNA category split (behaviorMutationRatio)', () => {
  it('routes to the behavior branch when the category roll is below the ratio', () => {
    const parent = dna({ body: 'Blue', behavior: starterInstructionMatrix() });
    // mutation roll 0 (succeeds); category roll 0.1 < ratio 0.2 -> behavior branch;
    // state pick 0, operator pick 0 -> 'rerollAction'; action pick 0.9 -> floor(0.9*8)=7 -> 'Rest'
    // (TowardConsume, the starter's own mode, excluded from the 8-item action pool).
    const rng = new MockRNG([0, 0.1, 0, 0, 0.9]);
    const child = mutateDNA(parent, rng, 1, 0.2);
    expect(child.body).toBe('Blue');
    expect(child.behavior[0]).not.toEqual(parent.behavior[0]);
    expect(child.instructionMutations).toBe(1);
    expect(child.traitMutations).toBe(0);
  });

  it('routes to the point-trait branch when the category roll is at or above the ratio', () => {
    const parent = dna({ body: 'Blue', behavior: starterInstructionMatrix() });
    // mutation roll 0 (succeeds); category roll 0.2 >= ratio 0.2 -> point-trait branch;
    // trait pick 0 -> 'body' (floor(0*4)=0); substance pick 0.3 -> 'Yellow'
    // (floor(0.3*4)=1 into ['Green','Yellow','White','Red'], 'Blue' excluded).
    const rng = new MockRNG([0, 0.2, 0, 0.3]);
    const child = mutateDNA(parent, rng, 1, 0.2);
    expect(child.body).toBe('Yellow');
    expect(child.behavior).toEqual(parent.behavior);
    expect(child.instructionMutations).toBe(0);
    expect(child.traitMutations).toBe(1);
  });
});

describe('starterInstructionMatrix', () => {
  const matrix = starterInstructionMatrix();

  it('has all 25 states populated with well-formed instructions', () => {
    expect(matrix).toHaveLength(INSTRUCTION_MATRIX_SIZE);
    for (const instruction of matrix) {
      expect(instruction.action).toBeDefined();
      expect(['<', '>=']).toContain(instruction.comparator);
      expect(Number.isFinite(instruction.threshold)).toBe(true);
      expect(Number.isInteger(instruction.jumpOffset)).toBe(true);
    }
  });

  it('has valid jump offsets: every true/false target lands within the ring', () => {
    matrix.forEach((instruction, index) => {
      const trueTarget = wrapMatrixIndex(index, instruction.jumpOffset);
      const falseTarget = wrapMatrixIndex(index, 1);
      expect(trueTarget).toBeGreaterThanOrEqual(0);
      expect(trueTarget).toBeLessThan(INSTRUCTION_MATRIX_SIZE);
      expect(falseTarget).toBeGreaterThanOrEqual(0);
      expect(falseTarget).toBeLessThan(INSTRUCTION_MATRIX_SIZE);
    });
  });

  it('is not stuck in a dead branch: every state is reachable from state 0', () => {
    const reachable = new Set<number>();
    const queue = [0];
    while (queue.length > 0) {
      const index = queue.pop()!;
      if (reachable.has(index)) continue;
      reachable.add(index);
      const instruction = matrix[index];
      queue.push(wrapMatrixIndex(index, instruction.jumpOffset));
      queue.push(wrapMatrixIndex(index, 1));
    }
    expect(reachable.size).toBe(INSTRUCTION_MATRIX_SIZE);
  });

  it('reaches both hunting and fleeing Move actions', () => {
    expect(matrix.some((i) => i.action.type === 'Move' && i.action.mode === 'TowardConsume')).toBe(true);
    expect(matrix.some((i) => i.action.type === 'Move' && i.action.mode === 'AwayFromToxin')).toBe(true);
  });

  it('reaches a Split action', () => {
    expect(matrix.some((i) => i.action.type === 'Split')).toBe(true);
  });

  it('reaches Produce and Rest actions occasionally, not on every state', () => {
    const produceOrRestCount = matrix.filter((i) => i.action.type === 'Produce' || i.action.type === 'Rest').length;
    expect(produceOrRestCount).toBeGreaterThan(0);
    expect(produceOrRestCount).toBeLessThan(matrix.length);
  });

  it('returns a fresh matrix each call (not a shared mutable reference)', () => {
    const other = starterInstructionMatrix();
    expect(other).toEqual(matrix);
    expect(other).not.toBe(matrix);
  });
});
