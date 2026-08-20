import { describe, expect, it } from 'vitest';
import { mutateDNA, randomConsumeSubstance, randomDNA, randomPhysicalSubstance } from '../../src/engine/dna';
import { PHYSICAL_SUBSTANCES } from '../../src/engine/types';
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
    const rng = new MockRNG([0.1, 0.2, 0.3, 0.4, 0.9]);
    const d = randomDNA(rng);
    expect(d.body).toBeDefined();
    expect(d.consume).toBeDefined();
    expect(d.produce).toBeDefined();
    expect(d.toxin).toBeDefined();
    expect(typeof d.canMove).toBe('boolean');
  });
});

describe('mutateDNA', () => {
  it('returns an exact copy (not the same reference) when the mutation roll fails', () => {
    const parent = dna({ body: 'Blue', consume: 'Green', produce: 'Yellow', toxin: 'Red', canMove: true });
    const rng = new MockRNG([0.5]); // 0.5 >= mutationRate(0.01) => no mutation
    const child = mutateDNA(parent, rng, 0.01);
    expect(child).toEqual(parent);
    expect(child).not.toBe(parent);
  });

  it('mutates exactly one trait when the mutation roll succeeds', () => {
    const parent = dna({ body: 'Blue', consume: 'Green', produce: 'Yellow', toxin: 'Red', canMove: true });
    // next() sequence: [0] mutation roll (succeeds, < rate), [0] trait pick -> 'body',
    // [0.3] new substance pick -> 'Green', which differs from the parent's 'Blue'.
    const rng = new MockRNG([0, 0, 0.3]);
    const child = mutateDNA(parent, rng, 1);
    const traits: (keyof typeof parent)[] = ['body', 'consume', 'produce', 'toxin', 'canMove'];
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
    // trait index 1 -> 'consume' (5 traits, pick(1/5=0.2) -> index 1); substance roll 0 -> Sun
    const rng = new MockRNG([0, 0.2, 0]);
    const child = mutateDNA(parent, rng, 1);
    expect(child.consume).toBe('Sun');
  });

  it('mutating "produce" never assigns Sun', () => {
    const parent = dna({ produce: 'Yellow' });
    // trait index 2 -> 'produce' (2/5 = 0.4)
    const rng = new MockRNG([0, 0.4, 0.1]);
    const child = mutateDNA(parent, rng, 1);
    expect(child.produce).not.toBe('Sun');
  });

  it('mutating "toxin" never assigns Sun', () => {
    const parent = dna({ toxin: 'Red' });
    // trait index 3 -> 'toxin' (3/5 = 0.6)
    const rng = new MockRNG([0, 0.6, 0.1]);
    const child = mutateDNA(parent, rng, 1);
    expect(child.toxin).not.toBe('Sun');
  });

  it('mutating "canMove" flips it to a random boolean', () => {
    const parent = dna({ canMove: true });
    // trait index 4 -> 'canMove' (4/5 = 0.8); boolean roll 0.9 -> false
    const rng = new MockRNG([0, 0.8, 0.9]);
    const child = mutateDNA(parent, rng, 1);
    expect(child.canMove).toBe(false);
  });
});
