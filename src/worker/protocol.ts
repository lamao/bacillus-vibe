import { GridView, Position } from '../engine/types';

/**
 * How often the main thread draws + updates the DOM. This simulation's visuals don't
 * need a full display refresh rate, so capping this saves main-thread CPU.
 */
export const RENDER_FPS = 30;

/**
 * How often the worker ticks-then-checks-in and posts a snapshot. Deliberately kept
 * faster than, and independent of, RENDER_FPS: checking in more often makes the worker
 * both more responsive to control messages (pause/speed/spawn) and able to sustain
 * higher tick throughput (each loop() call's tick-time budget is derived from this),
 * even though the main thread only ever consumes the latest snapshot it received and
 * so doesn't need every one the worker posts.
 */
export const WORKER_LOOP_FPS = 60;

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
