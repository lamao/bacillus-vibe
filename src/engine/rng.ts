/**
 * Randomness is injected everywhere in the engine so tests can control it
 * deterministically instead of depending on real RNG output.
 */
export interface RNG {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
}

export class DefaultRNG implements RNG {
  next(): number {
    return Math.random();
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
}

export function pick<T>(rng: RNG, items: readonly T[]): T {
  return items[rng.int(items.length)];
}
