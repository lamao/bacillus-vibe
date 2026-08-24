/** Headroom above the highest sample so a line touching the domain max doesn't clip the chart's top edge. */
const HEADROOM = 1.1;

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
  const domain = Math.max(1, maxValue) * HEADROOM;
  const lastIndex = Math.max(1, values.length - 1);
  return values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / lastIndex) * width;
      const y = height - margin - (value / domain) * (height - 2 * margin);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
