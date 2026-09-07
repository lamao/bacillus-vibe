import { describe, expect, it } from 'vitest';
import { computeTrend } from '../../src/ui/trend';

describe('computeTrend', () => {
  it('returns null when unchanged', () => {
    expect(computeTrend(10, 10)).toBeNull();
    expect(computeTrend(0, 0)).toBeNull();
  });

  it('returns null (ignored) when |% change| is below 3%', () => {
    expect(computeTrend(100, 101)).toBeNull(); // 1%
    expect(computeTrend(100, 102.9)).toBeNull(); // 2.9%
  });

  it('reports "up" when growing, "down" when shrinking', () => {
    expect(computeTrend(100, 110)?.direction).toBe('up');
    expect(computeTrend(100, 90)?.direction).toBe('down');
  });

  it('buckets |% change| into 1/2/3 chevrons', () => {
    expect(computeTrend(100, 105)?.chevrons).toBe(1); // 5%
    expect(computeTrend(100, 110)?.chevrons).toBe(2); // 10%
    expect(computeTrend(100, 120)?.chevrons).toBe(3); // 20%
  });

  it('treats the boundaries as inclusive of the faster bucket', () => {
    expect(computeTrend(100, 103)?.chevrons).toBe(1); // exactly 3%
    expect(computeTrend(100, 107)?.chevrons).toBe(2); // exactly 7%
    expect(computeTrend(100, 115)?.chevrons).toBe(3); // exactly 15%
  });

  it('treats a change from 0 as the fastest bucket', () => {
    expect(computeTrend(0, 5)).toEqual({ direction: 'up', chevrons: 3 });
  });

  it('treats a drop to 0 as -100% (fastest bucket, down)', () => {
    expect(computeTrend(5, 0)).toEqual({ direction: 'down', chevrons: 3 });
  });
});
