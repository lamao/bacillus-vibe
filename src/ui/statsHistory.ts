import { Substance } from '../engine/types';
import { AverageRatios } from './averages';

export interface StatsSample {
  tick: number;
  total: number;
  bySubstance: ReadonlyMap<Substance, number>;
  averages: AverageRatios;
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

  /** Records a sample for `tick`, ignored if `tick` matches the most recently recorded one. */
  record(tick: number, total: number, bySubstance: ReadonlyMap<Substance, number>, averages: AverageRatios): void {
    const last = this.samples[this.samples.length - 1];
    if (last && last.tick === tick) return;
    this.samples.push({ tick, total, bySubstance, averages });
    while (this.samples.length > 1 && tick - this.samples[0].tick > MAX_TIME_WINDOW) {
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
