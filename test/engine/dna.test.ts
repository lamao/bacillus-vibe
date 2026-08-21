import { describe, expect, it } from 'vitest';
import { mutateDNA, randomConsumeSubstance, randomDNA, randomPhysicalSubstance, starterInstructionMatrix } from '../../src/engine/dna';
import { INSTRUCTION_MATRIX_SIZE, PHYSICAL_SUBSTANCES, wrapMatrixIndex } from '../../src/engine/types';
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
});

describe('mutateDNA', () => {
  it('returns an exact copy (not the same reference) when the mutation roll fails', () => {
    const parent = dna({ body: 'Blue', consume: 'Green', produce: 'Yellow', toxin: 'Red' });
    const rng = new MockRNG([0.5]); // 0.5 >= mutationRate(0.01) => no mutation
    const child = mutateDNA(parent, rng, 0.01);
    expect(child).toEqual(parent);
    expect(child).not.toBe(parent);
  });

  it('mutates exactly one trait when the mutation roll succeeds', () => {
    const parent = dna({ body: 'Blue', consume: 'Green', produce: 'Yellow', toxin: 'Red' });
    // next() sequence: [0] mutation roll (succeeds, < rate), [0] trait pick -> 'body',
    // [0.3] new substance pick -> 'Green', which differs from the parent's 'Blue'.
    const rng = new MockRNG([0, 0, 0.3]);
    const child = mutateDNA(parent, rng, 1);
    const traits: (keyof typeof parent)[] = ['body', 'consume', 'produce', 'toxin'];
    const changed = traits.filter((t) => child[t] !== parent[t]);
    expect(changed).toHaveLength(1);
  });

  it('mutating "body" never assigns Sun', () => {
    const parent = dna({ body: 'Blue' });
    // trait index 0 -> 'body'; substance roll 0 -> first physical substance
    const rng = new MockRNG([0, 0, 0]);
    const child = mutateDNA(parent, rng, 1);
    expect(child.body).not.toBe('Sun');
  });

  it('mutating "consume" can assign Sun', () => {
    const parent = dna({ consume: 'Green' });
    // trait index 1 -> 'consume' (4 traits, pick(0.3) -> floor(0.3*4)=1); substance roll 0 -> Sun
    const rng = new MockRNG([0, 0.3, 0]);
    const child = mutateDNA(parent, rng, 1);
    expect(child.consume).toBe('Sun');
  });

  it('mutating "produce" never assigns Sun', () => {
    const parent = dna({ produce: 'Yellow' });
    // trait index 2 -> 'produce' (4 traits, pick(0.5) -> floor(0.5*4)=2)
    const rng = new MockRNG([0, 0.5, 0.1]);
    const child = mutateDNA(parent, rng, 1);
    expect(child.produce).not.toBe('Sun');
  });

  it('mutating "toxin" never assigns Sun', () => {
    const parent = dna({ toxin: 'Red' });
    // trait index 3 -> 'toxin' (4 traits, pick(0.75) -> floor(0.75*4)=3)
    const rng = new MockRNG([0, 0.75, 0.1]);
    const child = mutateDNA(parent, rng, 1);
    expect(child.toxin).not.toBe('Sun');
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
