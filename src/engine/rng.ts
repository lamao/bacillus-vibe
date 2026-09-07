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
    // Fallback only when Web Crypto is unavailable (every actual runtime here —
    // browser, Worker, Node 19+ — has it); seeds a simulation's display-only PRNG,
    // not a cryptographic or otherwise security-sensitive value.
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0; // NOSONAR
  }

  next(): number {
    // `| 0` performs 32-bit signed-integer wraparound (mulberry32's reference
    // algorithm), not float truncation — Math.trunc wouldn't wrap on overflow
    // and would silently change the generator's output.
    this.state = (this.state + 0x6d2b79f5) | 0; // NOSONAR
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

/**
 * Picks uniformly from `items` with `exclude` filtered out first, so the result is
 * guaranteed to differ from it — used by mutation operators (#80) that must always
 * actually change something rather than occasionally rerolling into the same value.
 * Callers are expected to only use this where `items` has multiple alternatives besides
 * `exclude`; an `items` that filters down to empty is a caller bug, not a runtime case
 * to guard against here.
 */
export function pickExcluding<T>(rng: RNG, items: readonly T[], exclude: T, eq: (a: T, b: T) => boolean = (a, b) => a === b): T {
  return pick(rng, items.filter((item) => !eq(item, exclude)));
}
