import { Substance } from '../engine/types';
import { AverageRatios } from './averages';

/** Births/deaths per second, wall-clock (see main.ts's sampleBirthsDeaths — a once-per-second diff of the engine's cumulative counters, not a per-tick count). */
export interface BirthsDeathsRate {
  births: number;
  deaths: number;
}

export const ZERO_BIRTHS_DEATHS_RATE: BirthsDeathsRate = { births: 0, deaths: 0 };

export interface StatsSample {
  tick: number;
  total: number;
  /** Mineral entity count (Composition tab, #41) — the organic-side count is `total`, the same series as the Population tab's total. */
  minerals: number;
  bySubstance: ReadonlyMap<Substance, number>;
  byConsume: ReadonlyMap<Substance, number>;
  byProduce: ReadonlyMap<Substance, number>;
  byToxin: ReadonlyMap<Substance, number>;
  averages: AverageRatios;
  birthsDeaths: BirthsDeathsRate;
}

/** Time windows offered by the stats drawer's "Last N ticks" chips. */
export const TIME_WINDOWS = [500, 2000, 10000] as const;
export type TimeWindow = (typeof TIME_WINDOWS)[number];

const MAX_TIME_WINDOW = TIME_WINDOWS[TIME_WINDOWS.length - 1];

/**
 * Rolling buffer of population samples, one per distinct tick observed. Pruned to the
 * widest "Last N ticks" window offered, so memory stays bounded no matter how long the
 * simulation keeps running.
 */
export class StatsHistory {
  private samples: StatsSample[] = [];

  /** Records `sample`, ignored if its tick matches the most recently recorded one. */
  record(sample: StatsSample): void {
    const last = this.samples[this.samples.length - 1];
    if (last?.tick === sample.tick) return;
    this.samples.push(sample);
    while (this.samples.length > 1 && sample.tick - this.samples[0].tick > MAX_TIME_WINDOW) {
      this.samples.shift();
    }
  }

  /** Samples within the last `window` ticks of the most recently recorded tick, oldest first. */
  window(window: TimeWindow): StatsSample[] {
    if (this.samples.length === 0) return [];
    const latestTick = this.samples[this.samples.length - 1].tick;
    const cutoff = latestTick - window;
    return this.samples.filter((sample) => sample.tick >= cutoff);
  }
}
