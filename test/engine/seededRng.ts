import { RNG } from '../../src/engine/rng';

/**
 * A small seeded PRNG (mulberry32) for tests that need many realistic-looking
 * random draws — unlike `MockRNG`'s short replayed queue, this produces a long,
 * well-distributed sequence while staying fully deterministic for a given seed.
 */
export class SeededRNG implements RNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
}
