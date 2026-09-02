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

/**
 * Seedable, serializable PRNG (mulberry32). Save/load and replay/export need
 * a generator whose entire numeric state can be read back and later restored
 * to resume a run byte-for-byte, which `Math.random()` can't offer.
 */
export class SeededRNG implements RNG {
  private state: number;

  constructor(seed: number = SeededRNG.randomSeed()) {
    this.state = seed >>> 0;
  }

  private static randomSeed(): number {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      return crypto.getRandomValues(new Uint32Array(1))[0];
    }
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
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

  /** Current internal state, suitable for persisting (e.g. on save). */
  getState(): number {
    return this.state;
  }

  /** Restores internal state previously read via {@link getState}, to resume a saved/replayed run. */
  setState(state: number): void {
    this.state = state >>> 0;
  }
}

export function pick<T>(rng: RNG, items: readonly T[]): T {
  return items[rng.int(items.length)];
}
