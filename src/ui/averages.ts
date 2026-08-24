import { Entity, Organic } from '../engine/types';

export interface AverageRatios {
  /** Mean of each organic's energy/size (matches the engine's EnergyRatio sensor), 0-1. */
  avgEnergy: number;
  /** Mean of each organic's age/maxAge (matches the engine's Age sensor), 0-1. */
  avgAge: number;
  /** Mean of each organic's size/maxSize (matches the engine's SizeRatio sensor), 0-1. */
  avgSize: number;
}

export const ZERO_AVERAGE_RATIOS: AverageRatios = { avgEnergy: 0, avgAge: 0, avgSize: 0 };

/**
 * Averages the same three 0-1 ratios the engine's instruction-matrix sensors read per
 * organic (`evaluateSensor` in `engine/phases.ts`) across the whole population, so the
 * Averages tab's chart is directly comparable to what an organic's own DNA "sees".
 */
export function computeAverageRatios(entities: readonly Entity[], maxAge: number, maxSize: number): AverageRatios {
  const organics = entities.filter((entity): entity is Organic => entity.kind === 'organic');
  if (organics.length === 0) return ZERO_AVERAGE_RATIOS;

  let energySum = 0;
  let ageSum = 0;
  let sizeSum = 0;
  for (const organic of organics) {
    energySum += organic.energy / organic.size;
    ageSum += organic.age / maxAge;
    sizeSum += organic.size / maxSize;
  }
  return { avgEnergy: energySum / organics.length, avgAge: ageSum / organics.length, avgSize: sizeSum / organics.length };
}
