import { describe, expect, it } from 'vitest';
import { SeededRNG, pick } from '../../src/engine/rng';
import { MockRNG } from './mockRng';

describe('SeededRNG', () => {
  it('next() is within [0, 1)', () => {
    const rng = new SeededRNG(1);
    for (let i = 0; i < 20; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(n) is within [0, n)', () => {
    const rng = new SeededRNG(1);
    for (let i = 0; i < 20; i++) {
      const v = rng.int(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('produces the same sequence for the same seed', () => {
    const a = new SeededRNG(42);
    const b = new SeededRNG(42);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces a different sequence for a different seed', () => {
    const a = new SeededRNG(42);
    const b = new SeededRNG(43);
    expect(a.next()).not.toBe(b.next());
  });

  it('defaults to a random seed when none is given, varying across instances', () => {
    const a = new SeededRNG();
    const b = new SeededRNG();
    expect(a.next()).not.toBe(b.next());
  });

  it('getState()/setState() round-trip so a restored RNG continues identically', () => {
    const original = new SeededRNG(99);
    original.next();
    original.next();
    const state = original.getState();

    const restored = new SeededRNG(0);
    restored.setState(state);

    const nextFromOriginal = original.next();
    const nextFromRestored = restored.next();
    expect(nextFromRestored).toBe(nextFromOriginal);
  });
});

describe('pick', () => {
  it('selects the item at the RNG-derived index', () => {
    const rng = new MockRNG([0.5]);
    expect(pick(rng, ['a', 'b', 'c', 'd'])).toBe('c');
  });
});

describe('MockRNG', () => {
  it('loops through its queue when exhausted', () => {
    const rng = new MockRNG([0.1, 0.9]);
    expect(rng.next()).toBe(0.1);
    expect(rng.next()).toBe(0.9);
    expect(rng.next()).toBe(0.1);
  });

  it('rejects an empty queue', () => {
    expect(() => new MockRNG([])).toThrow();
  });
});
