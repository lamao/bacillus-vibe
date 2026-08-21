import { Grid } from './grid';
import { mutateDNA } from './dna';
import { RNG, pick } from './rng';
import { Settings } from './settings';
import {
  Entity,
  Mineral,
  MoveMode,
  Organic,
  Position,
  Sensor,
  chebyshevDistance,
  substanceOf,
  wrapMatrixIndex,
} from './types';

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

/** Chebyshev distance to the nearest entity matching `dna.consume` within vision range, or `visionRange` if none is found. */
function foodDistance(organic: Organic, grid: Grid, settings: Settings): number {
  const candidates = grid
    .entitiesInRange(organic.position, settings.visionRange)
    .filter((e) => e !== organic && substanceOf(e) === organic.dna.consume);

  let nearest = settings.visionRange;
  for (const candidate of candidates) {
    nearest = Math.min(nearest, chebyshevDistance(organic.position, candidate.position));
  }
  return nearest;
}

/** Chebyshev distance to the nearest entity matching `dna.toxin` within toxin range, or `toxinRange` if none is found. */
function toxinDistance(organic: Organic, grid: Grid, settings: Settings): number {
  const candidates = grid
    .entitiesInRange(organic.position, settings.toxinRange)
    .filter((e) => e !== organic && substanceOf(e) === organic.dna.toxin);

  let nearest = settings.toxinRange;
  for (const candidate of candidates) {
    nearest = Math.min(nearest, chebyshevDistance(organic.position, candidate.position));
  }
  return nearest;
}

/** Count of other organics within vision range. */
function crowding(organic: Organic, grid: Grid, settings: Settings): number {
  return grid.entitiesInRange(organic.position, settings.visionRange).filter((e) => e !== organic && e.kind === 'organic').length;
}

/** Reads one instruction's sensor, per #5 §4's table. */
function evaluateSensor(sensor: Sensor, organic: Organic, grid: Grid, settings: Settings, rng: RNG): number {
  switch (sensor) {
    case 'FoodDist':
      return foodDistance(organic, grid, settings);
    case 'ToxinDist':
      return toxinDistance(organic, grid, settings);
    case 'EnergyRatio':
      return organic.energy / organic.size;
    case 'SizeRatio':
      return organic.size / settings.maxSize;
    case 'Age':
      return organic.age / settings.maxAge;
    case 'Crowding':
      return crowding(organic, grid, settings);
    case 'Random':
      return rng.next();
  }
}

/** Chebyshev unit step from `from` toward `to`, or `null` if the stepped-to cell is off-grid. */
function stepToward(from: Position, to: Position, grid: Grid): Position | null {
  const direction = { x: sign(to.x - from.x), y: sign(to.y - from.y) };
  const tx = from.x + direction.x;
  const ty = from.y + direction.y;
  return grid.inBounds(tx, ty) ? direction : null;
}

/** Steps toward the largest entity matching `dna.consume` within vision range, or `null` if none is in range. */
function towardConsume(organic: Organic, grid: Grid, settings: Settings): Position | null {
  const candidates = grid
    .entitiesInRange(organic.position, settings.visionRange)
    .filter((e) => e !== organic && substanceOf(e) === organic.dna.consume);

  let target: Entity | null = null;
  for (const candidate of candidates) {
    if (!target || candidate.size > target.size) target = candidate;
  }
  return target ? stepToward(organic.position, target.position, grid) : null;
}

/**
 * Steps away from the nearest entity matching `dna.toxin` within vision range, or
 * `null` if none is in range. `entitiesInRange` returns nearest-first, so the first
 * match is the nearest threat.
 */
function awayFromToxin(organic: Organic, grid: Grid, settings: Settings): Position | null {
  const nearest = grid
    .entitiesInRange(organic.position, settings.visionRange)
    .find((e) => e !== organic && substanceOf(e) === organic.dna.toxin);
  if (!nearest) return null;

  const direction = { x: -sign(nearest.position.x - organic.position.x), y: -sign(nearest.position.y - organic.position.y) };
  const tx = organic.position.x + direction.x;
  const ty = organic.position.y + direction.y;
  return grid.inBounds(tx, ty) ? direction : null;
}

/**
 * Steps into the free adjacent cell with the fewest other entities within vision
 * range of it (least crowded), or `null` if every adjacent cell is occupied.
 * Ties go to the first candidate scanned (row-major over dy then dx).
 */
function towardOpenSpace(organic: Organic, grid: Grid, settings: Settings): Position | null {
  let best: Position | null = null;
  let bestCrowding = Infinity;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const tx = organic.position.x + dx;
      const ty = organic.position.y + dy;
      if (!grid.isFree(tx, ty)) continue;

      const nearby = grid.entitiesInRange({ x: tx, y: ty }, settings.visionRange).length;
      if (nearby < bestCrowding) {
        bestCrowding = nearby;
        best = { x: dx, y: dy };
      }
    }
  }
  return best;
}

/** Steps in a uniformly random direction, or `null` if the stepped-to cell is off-grid. */
function randomStep(organic: Organic, grid: Grid, rng: RNG): Position | null {
  const direction = randomOffsetInRange(rng, 1);
  const tx = organic.position.x + direction.x;
  const ty = organic.position.y + direction.y;
  return grid.inBounds(tx, ty) ? direction : null;
}

/** Resolves the direction a `Move` action steps in this tick, per #5 §3's table. */
function resolveMoveDirection(mode: MoveMode, organic: Organic, grid: Grid, settings: Settings, rng: RNG): Position | null {
  switch (mode) {
    case 'TowardConsume':
      return towardConsume(organic, grid, settings);
    case 'AwayFromToxin':
      return awayFromToxin(organic, grid, settings);
    case 'TowardOpenSpace':
      return towardOpenSpace(organic, grid, settings);
    case 'Random':
      return randomStep(organic, grid, rng);
    case 'Hold':
      return null;
  }
}

/**
 * Phase 1: interprets each organic's current instruction — stamps `chosenAction`
 * (and a `Move` direction, if applicable) from the current state's action, then
 * evaluates its one test and advances `currentState`: the sensor read against the
 * threshold sends the ring forward by `jumpOffset` on true, or by 1 on false,
 * both wrapped modulo the ring size.
 */
export function decideAction(grid: Grid, settings: Settings, rng: RNG): void {
  for (const organic of grid.organics()) {
    const instruction = organic.dna.behavior[organic.currentState];
    organic.chosenAction = instruction.action;
    organic.direction =
      instruction.action.type === 'Move' ? resolveMoveDirection(instruction.action.mode, organic, grid, settings, rng) : null;

    const sensorValue = evaluateSensor(instruction.sensor, organic, grid, settings, rng);
    const testPassed = instruction.comparator === '<' ? sensorValue < instruction.threshold : sensorValue >= instruction.threshold;
    organic.currentState = wrapMatrixIndex(organic.currentState, testPassed ? instruction.jumpOffset : 1);
  }
}

/**
 * Phase 2: organics whose chosen action this tick was `Move`, and who have a
 * direction, spend MoveConsumption energy and step that way. A free target cell
 * means relocation; a matching-food target means a bite instead of a move;
 * anything else leaves the organic in place.
 */
export function moveOrganics(grid: Grid, settings: Settings): void {
  for (const organic of grid.organics()) {
    if (organic.chosenAction?.type !== 'Move' || !organic.direction) continue;

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
 * Phase 3: organics whose chosen action this tick was `Split` (Attempt) and who
 * are at or above ReproductionThreshold spend a randomized DefaultSize (+/-25%)
 * chunk of energy to attempt a split. A single random cell within
 * ReproductionRange is tried; if it's occupied or off-grid the split is
 * abandoned and part of the spent energy is refunded.
 */
export function reproduce(grid: Grid, settings: Settings, rng: RNG, nextId: () => number): void {
  const candidates = grid
    .organics()
    .filter((o) => o.chosenAction?.type === 'Split' && o.energy >= settings.reproductionThreshold);

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
        chosenAction: null,
      };
      grid.set(tx, ty, offspring);
      parent.size -= spent;
    } else {
      parent.energy += spent * settings.returnHealthWhenReproductionFails;
    }
  }
}

/**
 * Phase 4: Sun-consumers gain SunYield regardless of position. Organics whose
 * chosen action this tick wasn't `Move` additionally drain matching
 * minerals/organics within ConsumingRange (ambient passive digestion — see #5
 * §3). Of the raw amount drained, ProductionPerformance becomes waste; the
 * rest is gained.
 */
export function consume(grid: Grid, settings: Settings): void {
  for (const organic of grid.organics()) {
    if (organic.dna.consume === 'Sun') {
      gainEnergy(organic, settings.sunYield, settings);
    }

    if (organic.chosenAction?.type === 'Move') continue;

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
 * Phase 5: organics whose chosen action this tick was `Produce` (Release) try to
 * dump their accumulated waste within ProductionRange, topping up matching
 * minerals first, then creating new ones in free cells. Waste that still can't
 * be placed poisons the organic directly. Organics that chose `Produce` (Hold),
 * or any other action, keep hoarding: their waste stays accumulated for a later
 * Release tick.
 */
export function produceWaste(grid: Grid, settings: Settings): void {
  for (const organic of grid.organics()) {
    if (organic.chosenAction?.type !== 'Produce' || organic.chosenAction.mode !== 'Release') continue;
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
