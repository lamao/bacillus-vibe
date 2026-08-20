import { describe, expect, it } from 'vitest';
import { DefaultRNG, pick } from '../../src/engine/rng';
import { MockRNG } from './mockRng';

describe('DefaultRNG', () => {
  it('next() is within [0, 1)', () => {
    const rng = new DefaultRNG();
    for (let i = 0; i < 20; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(n) is within [0, n)', () => {
    const rng = new DefaultRNG();
    for (let i = 0; i < 20; i++) {
      const v = rng.int(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
      expect(Number.isInteger(v)).toBe(true);
    }
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
