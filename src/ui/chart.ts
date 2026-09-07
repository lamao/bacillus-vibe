/** Headroom above the highest sample so a line touching the domain max doesn't clip the chart's top edge. */
const HEADROOM = 1.1;

/**
 * The actual y-axis domain top for a chart autoscaled to `maxValue`: never below 1 (so
 * an all-zero series doesn't divide by zero) and padded by {@link HEADROOM}. Exported so
 * callers can derive matching y-axis reference labels for what {@link scaleLinePoints}
 * actually plotted, rather than labeling the raw (pre-headroom) `maxValue`.
 */
export function scaleDomain(maxValue: number): number {
  return Math.max(1, maxValue) * HEADROOM;
}

/**
 * Maps a series of non-negative values onto an SVG `<polyline>`'s `points` attribute:
 * evenly spaced along the x-axis across `width`, scaled on the y-axis into
 * `[margin, height - margin]` against the shared `maxValue` domain (so multiple series
 * plotted with the same `maxValue` stay comparable on one chart).
 */
export function scaleLinePoints(
  values: readonly number[],
  width: number,
  height: number,
  margin: number,
  maxValue: number,
): string {
  if (values.length === 0) return '';
  const domain = scaleDomain(maxValue);
  const lastIndex = Math.max(1, values.length - 1);
  return values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / lastIndex) * width;
      const y = height - margin - (value / domain) * (height - 2 * margin);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
