export type TrendDirection = 'up' | 'down';

export interface Trend {
  direction: TrendDirection;
  /** 1-3, mapping |% change| into slow/medium/fast buckets. */
  chevrons: 1 | 2 | 3;
}

const IGNORE_CHANGE_THRESHOLD = 0.03;
const MEDIUM_CHANGE_THRESHOLD = 0.07;
const FAST_CHANGE_THRESHOLD = 0.15;

/**
 * Classifies the change from `previous` to `current` into a trend direction and
 * chevron count, or `null` when the value is unchanged or its |% change| is below
 * the noise floor (per spec, no chevron is shown rather than a neutral glyph). A
 * previous value of 0 is treated as the fastest bucket, since percent change is
 * undefined.
 */
export function computeTrend(previous: number, current: number): Trend | null {
  if (current === previous) return null;
  const percentChange = previous === 0 ? Infinity : Math.abs(current - previous) / previous;
  if (percentChange < IGNORE_CHANGE_THRESHOLD) return null;
  const chevrons = percentChange < MEDIUM_CHANGE_THRESHOLD ? 1 : percentChange < FAST_CHANGE_THRESHOLD ? 2 : 3;
  return { direction: current > previous ? 'up' : 'down', chevrons };
}
