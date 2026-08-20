import { Grid } from './grid';
import { mutateDNA } from './dna';
import { RNG, pick } from './rng';
import { Settings } from './settings';
import { Entity, Mineral, Organic, Position, chebyshevDistance, substanceOf } from './types';

const DIRECTIONS: Position[] = [];
for (let dy = -1; dy <= 1; dy++) {
  for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0) continue;
    DIRECTIONS.push({ x: dx, y: dy });
  }
}

function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

function randomOffsetInRange(rng: RNG, range: number): Position {
  const options: Position[] = [];
  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      if (dx === 0 && dy === 0) continue;
      options.push({ x: dx, y: dy });
    }
  }
  return pick(rng, options);
}

/** Adds `amount` energy, spilling into `size` growth (capped at maxSize) once energy is full. */
function gainEnergy(organic: Organic, amount: number, settings: Settings): void {
  if (amount <= 0) return;
  const room = organic.size - organic.energy;
  if (amount <= room) {
    organic.energy += amount;
    return;
  }
  const overflow = amount - room;
  organic.size = Math.min(settings.maxSize, organic.size + overflow);
  organic.energy = organic.size;
}

/** Removes up to `amount` size from `entity`, returning the amount actually drained. */
function drainEntity(entity: Entity, amount: number): number {
  const drained = Math.min(amount, entity.size);
  entity.size -= drained;
  if (entity.kind === 'organic') {
    entity.energy = Math.min(entity.energy, entity.size);
  }
  return drained;
}

/**
 * Phase 1: moving organics look for the largest matching-`consume` entity within
 * vision range and set direction toward it; otherwise pick a random direction
 * (or none, if that would leave the grid). Non-movers get no direction.
 */
export function decideDirections(grid: Grid, settings: Settings, rng: RNG): void {
  for (const organic of grid.organics()) {
    if (!organic.dna.canMove) {
      organic.direction = null;
      continue;
    }

    const candidates = grid
      .entitiesInRange(organic.position, settings.visionRange)
      .filter((e) => e !== organic && substanceOf(e) === organic.dna.consume);

    let target: Entity | null = null;
    for (const candidate of candidates) {
      if (!target || candidate.size > target.size) target = candidate;
    }

    const direction = target
      ? { x: sign(target.position.x - organic.position.x), y: sign(target.position.y - organic.position.y) }
      : pick(rng, DIRECTIONS);

    const tx = organic.position.x + direction.x;
    const ty = organic.position.y + direction.y;
    organic.direction = grid.inBounds(tx, ty) ? direction : null;
  }
}

/**
 * Phase 2: moving organics with a direction spend MoveConsumption energy and step
 * that way. A free target cell means relocation; a matching-food target means a
 * bite instead of a move; anything else leaves the organic in place.
 */
export function moveOrganics(grid: Grid, settings: Settings): void {
  for (const organic of grid.organics()) {
    if (!organic.dna.canMove || !organic.direction) continue;

    organic.energy -= settings.moveConsumption;

    const tx = organic.position.x + organic.direction.x;
    const ty = organic.position.y + organic.direction.y;
    if (!grid.inBounds(tx, ty)) continue;

    const occupant = grid.get(tx, ty);
    if (!occupant) {
      grid.moveEntity(organic, { x: tx, y: ty });
      continue;
    }

    if (substanceOf(occupant) === organic.dna.consume) {
      const raw = drainEntity(occupant, settings.biteYield);
      const waste = raw * settings.productionPerformance;
      const gain = raw - waste;
      organic.accumulatedWaste += waste;
      gainEnergy(organic, gain, settings);
    }
  }
}

/**
 * Phase 3: organics at or above ReproductionThreshold spend a randomized
 * DefaultSize (+/-25%) chunk of energy to attempt a split. A single random cell
 * within ReproductionRange is tried; if it's occupied or off-grid the split is
 * abandoned and part of the spent energy is refunded.
 */
export function reproduce(grid: Grid, settings: Settings, rng: RNG, nextId: () => number): void {
  const candidates = grid.organics().filter((o) => o.energy >= settings.reproductionThreshold);

  for (const parent of candidates) {
    const spent = settings.defaultSize * (1 + (rng.next() * 0.5 - 0.25));
    parent.energy -= spent;

    const offset = randomOffsetInRange(rng, settings.reproductionRange);
    const tx = parent.position.x + offset.x;
    const ty = parent.position.y + offset.y;

    if (grid.isFree(tx, ty)) {
      const offspring: Organic = {
        kind: 'organic',
        id: nextId(),
        position: { x: tx, y: ty },
        size: spent,
        energy: spent,
        direction: null,
        age: 0,
        accumulatedWaste: 0,
        dna: mutateDNA(parent.dna, rng, settings.mutationRate),
        currentState: 0,
      };
      grid.set(tx, ty, offspring);
      parent.size -= spent;
    } else {
      parent.energy += spent * settings.returnHealthWhenReproductionFails;
    }
  }
}

/**
 * Phase 4: Sun-consumers gain SunYield regardless of position. Non-movers
 * additionally drain matching minerals/organics within ConsumingRange. Of the
 * raw amount drained, ProductionPerformance becomes waste; the rest is gained.
 */
export function consume(grid: Grid, settings: Settings): void {
  for (const organic of grid.organics()) {
    if (organic.dna.consume === 'Sun') {
      gainEnergy(organic, settings.sunYield, settings);
    }

    if (organic.dna.canMove) continue;

    const targets = grid
      .entitiesInRange(organic.position, settings.consumingRange)
      .filter((e) => e !== organic && substanceOf(e) === organic.dna.consume);

    let rawTotal = 0;
    for (const target of targets) {
      rawTotal += drainEntity(target, settings.mineralsYield);
    }

    if (rawTotal > 0) {
      const waste = rawTotal * settings.productionPerformance;
      gainEnergy(organic, rawTotal - waste, settings);
      organic.accumulatedWaste += waste;
    }
  }
}

/**
 * Phase 5: organics with accumulated waste try to dump it within ProductionRange,
 * topping up matching minerals first, then creating new ones in free cells.
 * Waste that still can't be placed poisons the organic directly.
 */
export function produceWaste(grid: Grid, settings: Settings): void {
  for (const organic of grid.organics()) {
    if (organic.accumulatedWaste <= 0) continue;
    let remaining = organic.accumulatedWaste;

    const matchingMinerals = grid
      .entitiesInRange(organic.position, settings.productionRange)
      .filter((e): e is Mineral => e.kind === 'mineral' && e.substance === organic.dna.produce);

    for (const mineral of matchingMinerals) {
      if (remaining <= 0) break;
      const room = Math.max(0, settings.maxSize - mineral.size);
      const add = Math.min(remaining, room);
      mineral.size += add;
      remaining -= add;
    }

    if (remaining > 0) {
      const freeCells = grid
        .positionsInRange(organic.position.x, organic.position.y, settings.productionRange)
        .filter((p) => grid.isFree(p.x, p.y));

      for (const cell of freeCells) {
        if (remaining <= 0) break;
        const amount = Math.min(remaining, settings.maxSize);
        const mineral: Mineral = { kind: 'mineral', position: cell, size: amount, substance: organic.dna.produce };
        grid.set(cell.x, cell.y, mineral);
        remaining -= amount;
      }
    }

    if (remaining > 0) {
      organic.energy -= remaining;
    }
    organic.accumulatedWaste = 0;
  }
}

/**
 * Phase 6: organics take damage from every matching-toxin entity within
 * ToxinRange, inversely proportional to distance (nearer sources hurt more).
 */
export function applyToxin(grid: Grid, settings: Settings): void {
  for (const organic of grid.organics()) {
    const sources = grid
      .entitiesInRange(organic.position, settings.toxinRange)
      .filter((e) => e !== organic && substanceOf(e) === organic.dna.toxin);

    let damage = 0;
    for (const source of sources) {
      const distance = chebyshevDistance(organic.position, source.position);
      damage += source.size / Math.pow(2, distance - 1);
    }
    organic.energy -= damage;
  }
}

/** Phase 7: every organic pays its base metabolic cost and ages; every mineral decays. */
export function exhaust(grid: Grid, settings: Settings): void {
  for (const organic of grid.organics()) {
    organic.energy -= settings.permanentConsumption;
    organic.age += 1;
  }
  for (const mineral of grid.minerals()) {
    mineral.size -= settings.mineralDegradation;
  }
}

/**
 * Phase 8: organics that ran out of energy or hit MaxAge die, leaving a corpse
 * mineral behind if they still had body mass. Depleted minerals disappear.
 */
export function cleanup(grid: Grid, settings: Settings): void {
  for (const organic of grid.organics()) {
    if (organic.energy > 0 && organic.age < settings.maxAge) continue;

    grid.clear(organic.position.x, organic.position.y);
    if (organic.size > 0) {
      const corpse: Mineral = {
        kind: 'mineral',
        position: organic.position,
        size: organic.size,
        substance: organic.dna.body,
      };
      grid.set(corpse.position.x, corpse.position.y, corpse);
    }
  }

  for (const mineral of grid.minerals()) {
    if (mineral.size <= 0) {
      grid.clear(mineral.position.x, mineral.position.y);
    }
  }
}
