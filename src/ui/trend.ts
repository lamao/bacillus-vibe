export type TrendDirection = 'up' | 'down';

export interface Trend {
  direction: TrendDirection;
  /** 1-3, mapping |% change| into slow/medium/fast buckets. */
  chevrons: 1 | 2 | 3;
}

const MEDIUM_CHANGE_THRESHOLD = 0.03;
const FAST_CHANGE_THRESHOLD = 0.1;

/**
 * Classifies the change from `previous` to `current` into a trend direction and
 * chevron count, or `null` when the value is exactly unchanged (per spec, no
 * chevron is shown for a flat count rather than a neutral glyph). A previous
 * value of 0 is treated as the fastest bucket, since percent change is undefined.
 */
export function computeTrend(previous: number, current: number): Trend | null {
  if (current === previous) return null;
  const percentChange = previous === 0 ? Infinity : Math.abs(current - previous) / previous;
  const chevrons = percentChange < MEDIUM_CHANGE_THRESHOLD ? 1 : percentChange < FAST_CHANGE_THRESHOLD ? 2 : 3;
  return { direction: current > previous ? 'up' : 'down', chevrons };
}
