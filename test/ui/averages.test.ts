import { describe, expect, it } from 'vitest';
import { Entity } from '../../src/engine/types';
import { computeAverageRatios } from '../../src/ui/averages';
import { mineral, organic } from '../engine/fixtures';

describe('computeAverageRatios', () => {
  it('returns zero ratios for an empty entity list', () => {
    expect(computeAverageRatios([], 1500, 2200)).toEqual({ avgEnergy: 0, avgAge: 0, avgSize: 0 });
  });

  it('returns zero ratios when only minerals are present', () => {
    const entities: Entity[] = [mineral({ x: 0, y: 0 }, 'Red', 100)];
    expect(computeAverageRatios(entities, 1500, 2200)).toEqual({ avgEnergy: 0, avgAge: 0, avgSize: 0 });
  });

  it('averages energy/size, age/maxAge, and size/maxSize across organics only', () => {
    const entities: Entity[] = [
      organic({ x: 0, y: 0 }, { energy: 500, size: 1000, age: 300 }),
      organic({ x: 1, y: 0 }, { energy: 1000, size: 1000, age: 900 }),
      mineral({ x: 2, y: 0 }, 'Red', 100),
    ];
    const result = computeAverageRatios(entities, 1500, 2000);
    // energy ratios: 0.5, 1.0 -> avg 0.75
    expect(result.avgEnergy).toBeCloseTo(0.75);
    // age ratios: 300/1500=0.2, 900/1500=0.6 -> avg 0.4
    expect(result.avgAge).toBeCloseTo(0.4);
    // size ratios: 1000/2000=0.5, 1000/2000=0.5 -> avg 0.5
    expect(result.avgSize).toBeCloseTo(0.5);
  });

  it('handles a single organic (ratios equal its own)', () => {
    const entities: Entity[] = [organic({ x: 0, y: 0 }, { energy: 750, size: 750, age: 1500 })];
    const result = computeAverageRatios(entities, 1500, 2200);
    expect(result.avgEnergy).toBeCloseTo(1);
    expect(result.avgAge).toBeCloseTo(1);
    expect(result.avgSize).toBeCloseTo(750 / 2200);
  });
});
