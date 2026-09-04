import { randomDNA } from './dna';
import { Grid } from './grid';
import {
  applyToxin,
  cleanup,
  consume,
  decideAction,
  exhaust,
  moveOrganics,
  produceWaste,
  reproduce,
} from './phases';
import { RNG, SeededRNG } from './rng';
import { Settings, defaultSettings } from './settings';
import { DNA, Entity, Mineral, Organic, Position, Substance } from './types';

export interface TickResult {
  births: number;
  deaths: number;
}

/** Bumped whenever {@link SimulationState}'s shape changes in a way old saves can't be read as. */
export const SIMULATION_STATE_VERSION = 1;

/**
 * Everything needed to resume a `Simulation` later or share it with someone else (#29):
 * settings, RNG state, tick/id counters, and the grid's entities. Deliberately plain,
 * JSON-serializable data (no class instances, no `Map`/`Set`) so it round-trips through
 * `localStorage` or a downloaded file with a plain `JSON.stringify`/`parse`.
 */
export interface SimulationState {
  version: number;
  settings: Settings;
  rngState: number;
  tickCount: number;
  idCounter: number;
  totalBirths: number;
  totalDeaths: number;
  entities: Entity[];
}

/** Runs one full tick: all eight phases, in order, over the whole population. */
export function tick(grid: Grid, settings: Settings, rng: RNG, nextId: () => number): TickResult {
  decideAction(grid, settings, rng);
  moveOrganics(grid, settings);
  const births = reproduce(grid, settings, rng, nextId);
  consume(grid, settings);
  produceWaste(grid, settings);
  applyToxin(grid, settings);
  exhaust(grid, settings);
  const deaths = cleanup(grid, settings);
  return { births, deaths };
}

export class Simulation {
  readonly grid: Grid;
  readonly settings: Settings;
  /**
   * Exposed (not private) so callers that need to draw from the same deterministic
   * stream as the simulation itself — e.g. scenario preset seeding (#32), which
   * generates DNA outside of `spawnRandomOrganic`'s own `randomDNA` call — can do so
   * without opening a second, independent RNG.
   */
  readonly rng: RNG;
  private idCounter = 0;
  tickCount = 0;
  /** Cumulative counts since the simulation started, for #40's Births & deaths tab (diffed client-side into a per-second rate, the same way as the header trend chevrons). */
  totalBirths = 0;
  totalDeaths = 0;

  constructor(settings: Settings = defaultSettings(), rng: RNG = new SeededRNG()) {
    this.settings = settings;
    this.grid = new Grid(settings.width, settings.height);
    this.rng = rng;
  }

  private readonly nextId = (): number => this.idCounter++;

  spawnOrganicAt(position: Position, dna?: DNA): Organic | null {
    if (!this.grid.isFree(position.x, position.y)) return null;
    const organic: Organic = {
      kind: 'organic',
      id: this.nextId(),
      position,
      size: this.settings.defaultSize,
      energy: this.settings.defaultSize,
      direction: null,
      age: 0,
      accumulatedWaste: 0,
      dna: dna ?? randomDNA(this.rng),
      currentState: 0,
      chosenAction: null,
    };
    this.grid.set(position.x, position.y, organic);
    return organic;
  }

  spawnRandomOrganic(dna?: DNA): Organic | null {
    const position = this.randomFreePosition();
    if (!position) return null;
    return this.spawnOrganicAt(position, dna);
  }

  spawnMineralAt(position: Position, substance: Substance, size: number): Mineral | null {
    if (!this.grid.isFree(position.x, position.y)) return null;
    const mineral: Mineral = { kind: 'mineral', position, size, substance };
    this.grid.set(position.x, position.y, mineral);
    return mineral;
  }

  /** Scatters one mineral of `substance`/`size` onto a random free cell; used by scenario presets (#32) to seed extra starting food. */
  spawnRandomMineral(substance: Substance, size: number): Mineral | null {
    const position = this.randomFreePosition();
    if (!position) return null;
    return this.spawnMineralAt(position, substance, size);
  }

  /** A uniformly random free cell, or null if the grid is full. */
  private randomFreePosition(): Position | null {
    const free: Position[] = [];
    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < this.grid.width; x++) {
        if (this.grid.isFree(x, y)) free.push({ x, y });
      }
    }
    if (free.length === 0) return null;
    return free[Math.floor(this.rng.next() * free.length)];
  }

  step(): void {
    const { births, deaths } = tick(this.grid, this.settings, this.rng, this.nextId);
    this.totalBirths += births;
    this.totalDeaths += deaths;
    this.tickCount += 1;
  }

  /**
   * Snapshots this simulation's full state for save/load (#29). Requires a `SeededRNG` —
   * the only concrete `RNG` used outside tests, and the only one whose internal state can
   * be read back — so a byte-for-byte resume via {@link fromState} is possible.
   */
  toState(): SimulationState {
    if (!(this.rng instanceof SeededRNG)) {
      throw new TypeError('Simulation.toState requires a SeededRNG-backed simulation');
    }
    return {
      version: SIMULATION_STATE_VERSION,
      settings: this.settings,
      rngState: this.rng.getState(),
      tickCount: this.tickCount,
      idCounter: this.idCounter,
      totalBirths: this.totalBirths,
      totalDeaths: this.totalDeaths,
      entities: this.grid.entities(),
    };
  }

  /** Rebuilds a `Simulation` from a snapshot taken by {@link toState}, resuming — RNG included — exactly where it left off. */
  static fromState(state: SimulationState): Simulation {
    const sim = new Simulation(state.settings, new SeededRNG(state.rngState));
    sim.idCounter = state.idCounter;
    sim.tickCount = state.tickCount;
    sim.totalBirths = state.totalBirths;
    sim.totalDeaths = state.totalDeaths;
    for (const entity of state.entities) {
      sim.grid.set(entity.position.x, entity.position.y, entity);
    }
    return sim;
  }
}
