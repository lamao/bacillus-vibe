import { GridView, Position } from '../engine/types';

/** Messages the main thread sends to the simulation worker. */
export type WorkerRequest =
  | { type: 'setPaused'; paused: boolean }
  | { type: 'setTicksPerSecond'; ticksPerSecond: number }
  | { type: 'spawnRandomOrganic' }
  | { type: 'spawnOrganicAt'; position: Position };

/**
 * A snapshot of the simulation's grid, posted from the worker once per
 * render-loop iteration — independent of `ticksPerSecond`, which only
 * controls how many `tick()`s run before each snapshot goes out.
 */
export interface SimulationSnapshot extends GridView {
  type: 'state';
  tickCount: number;
}

export type WorkerResponse = SimulationSnapshot;
