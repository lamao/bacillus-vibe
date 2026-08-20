import { RNG } from '../../src/engine/rng';

/**
 * A deterministic RNG for tests: `next()` replays a fixed queue of values
 * (looping if exhausted), and `int()` derives from `next()` the same way
 * DefaultRNG does, so test expectations can be computed by hand.
 */
export class MockRNG implements RNG {
  private index = 0;

  constructor(private readonly values: number[] = [0]) {
    if (values.length === 0) throw new Error('MockRNG requires at least one value');
  }

  next(): number {
    const v = this.values[this.index % this.values.length];
    this.index += 1;
    return v;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
}

/** RNG whose next() always returns the same constant. */
export function constantRng(value: number): RNG {
  return new MockRNG([value]);
}
