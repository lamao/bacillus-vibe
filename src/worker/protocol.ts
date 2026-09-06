import { SimulationState } from '../engine/simulation';
import { Settings, TunableSettings } from '../engine/settings';
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
  | { type: 'spawnOrganicAt'; position: Position }
  | { type: 'stepOnce' }
  | { type: 'exportState' }
  | { type: 'importState'; state: SimulationState }
  | { type: 'applyPreset'; presetId: string }
  | { type: 'updateSettings'; settings: Partial<TunableSettings> };

/**
 * A snapshot of the simulation's grid, posted from the worker once per
 * render-loop iteration — independent of `ticksPerSecond`, which only
 * controls how many `tick()`s run before each snapshot goes out.
 */
export interface SimulationSnapshot extends GridView {
  type: 'state';
  tickCount: number;
  /** Cumulative since the simulation started; diffed client-side into a per-second rate for #40's Births & deaths tab. */
  totalBirths: number;
  totalDeaths: number;
}

/**
 * The current engine Settings, posted once up front, again after any wholesale
 * replacement (`importState`/`applyPreset`), and again after a live `updateSettings`
 * edit — rather than repeated on every SimulationSnapshot. The main thread uses
 * `maxAge`/`maxSize` for the Averages tab's 0-1 ratios (see engine/phases.ts's
 * evaluateSensor) and the full object to keep the live-tuning panel's sliders in sync.
 */
export interface WorkerSettings {
  type: 'settings';
  settings: Settings;
}

/** Reply to an `exportState` request, carrying a full save/load snapshot (#29) of the running simulation. */
export interface ExportedState {
  type: 'exportedState';
  state: SimulationState;
}

export type WorkerResponse = SimulationSnapshot | WorkerSettings | ExportedState;
