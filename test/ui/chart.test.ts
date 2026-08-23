import { describe, expect, it } from 'vitest';
import { scaleLinePoints } from '../../src/ui/chart';

describe('scaleLinePoints', () => {
  it('returns an empty string for no values', () => {
    expect(scaleLinePoints([], 100, 100, 10, 10)).toBe('');
  });

  it('places a single value at x=0', () => {
    const points = scaleLinePoints([5], 100, 100, 10, 10);
    expect(points).toMatch(/^0\.0,/);
    expect(points.split(' ')).toHaveLength(1);
  });

  it('spaces multiple values evenly across the full width', () => {
    const points = scaleLinePoints([0, 0, 0], 100, 100, 0, 10).split(' ');
    expect(points.map((p) => p.split(',')[0])).toEqual(['0.0', '50.0', '100.0']);
  });

  it('keeps a value at the domain max below the very top edge (headroom)', () => {
    const [, y] = scaleLinePoints([10], 100, 100, 0, 10).split(',');
    expect(Number(y)).toBeGreaterThan(0);
  });

  it('maps a value of 0 to the bottom margin', () => {
    const [, y] = scaleLinePoints([0], 100, 100, 10, 10).split(',');
    expect(Number(y)).toBe(90);
  });

  it('treats a maxValue of 0 as 1 to avoid dividing by zero', () => {
    expect(() => scaleLinePoints([0, 0], 100, 100, 10, 0)).not.toThrow();
  });
});
