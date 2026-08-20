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
import { DefaultRNG, RNG } from './rng';
import { Settings, defaultSettings } from './settings';
import { DNA, Organic, Position } from './types';

/** Runs one full tick: all eight phases, in order, over the whole population. */
export function tick(grid: Grid, settings: Settings, rng: RNG, nextId: () => number): void {
  decideAction(grid, settings, rng);
  moveOrganics(grid, settings);
  reproduce(grid, settings, rng, nextId);
  consume(grid, settings);
  produceWaste(grid, settings);
  applyToxin(grid, settings);
  exhaust(grid, settings);
  cleanup(grid, settings);
}

export class Simulation {
  readonly grid: Grid;
  readonly settings: Settings;
  private readonly rng: RNG;
  private idCounter = 0;
  tickCount = 0;

  constructor(settings: Settings = defaultSettings(), rng: RNG = new DefaultRNG()) {
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
    const free: Position[] = [];
    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < this.grid.width; x++) {
        if (this.grid.isFree(x, y)) free.push({ x, y });
      }
    }
    if (free.length === 0) return null;
    const position = free[Math.floor(this.rng.next() * free.length)];
    return this.spawnOrganicAt(position, dna);
  }

  step(): void {
    tick(this.grid, this.settings, this.rng, this.nextId);
    this.tickCount += 1;
  }
}
