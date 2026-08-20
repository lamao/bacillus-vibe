export interface Settings {
  width: number;
  height: number;

  /** Energy gained from biting an adjacent food entity while moving. */
  biteYield: number;
  /** Energy gained per tick by Sun-consumers. */
  sunYield: number;
  /** Max amount drained from a matching mineral/organic per tick (passive digestion). */
  mineralsYield: number;
  /** Energy cost of taking a move step. */
  moveConsumption: number;
  /** Base metabolic energy cost per tick, always applied. */
  permanentConsumption: number;
  /** Fraction of consumed food lost to inefficiency, becomes waste. */
  productionPerformance: number;
  /** Mineral size decay per tick. */
  mineralDegradation: number;
  /** Starting size of a spawned/offspring organic. */
  defaultSize: number;
  /** Energy level that triggers splitting. */
  reproductionThreshold: number;
  /** Hard cap on size/energy. */
  maxSize: number;
  /** Organic dies of old age at this age. */
  maxAge: number;
  /** Radius (Chebyshev distance) for spotting food to move toward. */
  visionRange: number;
  /** Radius for passive mineral/organic digestion. */
  consumingRange: number;
  /** Radius for depositing waste as minerals. */
  productionRange: number;
  /** Radius within which toxin sources damage a cell. */
  toxinRange: number;
  /** Radius offspring can be placed at, relative to parent. */
  reproductionRange: number;
  /** Probability a single DNA trait mutates on reproduction. */
  mutationRate: number;
  /** Fraction of the would-be offspring's energy refunded to the parent if reproduction can't place the offspring. */
  returnHealthWhenReproductionFails: number;
}

export const DEFAULT_GRID_SIZE = 80;

export function defaultSettings(width = DEFAULT_GRID_SIZE, height = DEFAULT_GRID_SIZE): Settings {
  const reproductionThreshold = 2000;
  const biteYield = 200;
  return {
    width,
    height,
    biteYield,
    sunYield: 25,
    mineralsYield: 10,
    moveConsumption: 10,
    permanentConsumption: 10,
    productionPerformance: 0.1,
    mineralDegradation: 3,
    defaultSize: 750,
    reproductionThreshold,
    maxSize: reproductionThreshold + biteYield,
    maxAge: 1500,
    visionRange: 1,
    consumingRange: 2,
    productionRange: 1,
    toxinRange: 2,
    reproductionRange: 1,
    mutationRate: 0.01,
    returnHealthWhenReproductionFails: 0.5,
  };
}
