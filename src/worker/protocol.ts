import { DNA, InstructionMatrix, Mineral, Organic, Position } from '../engine/types';

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
  | { type: 'stepOnce' };

/**
 * An organic's DNA as sent over the wire: `behavior` (the 25-instruction matrix — the bulk of
 * a DNA's serialized size) is omitted once the main thread already has it. It never changes
 * after birth (see `mutateDNA` in `engine/dna.ts`), so re-cloning it through `postMessage` on
 * every snapshot (up to `WORKER_LOOP_FPS` times/sec, for every living organic) is wasted work;
 * see `postSnapshot` in `simulation-worker.ts` for where it's included exactly once per organic.
 */
export type WireDNA = Omit<DNA, 'behavior'> & { behavior?: InstructionMatrix };

export interface WireOrganic extends Omit<Organic, 'dna'> {
  dna: WireDNA;
}

export type WireEntity = WireOrganic | Mineral;

/**
 * The message actually posted from the worker to the main thread once per render-loop
 * iteration — independent of `ticksPerSecond`, which only controls how many `tick()`s run
 * before each snapshot goes out. The main thread reconstructs a full-DNA view from this plus
 * a per-organic-id `behavior` cache (see `SimulationSnapshot`/`reconstructSnapshot` in
 * `main.ts`) so nothing downstream of that reconstruction needs to know DNA was ever split.
 */
export interface SnapshotMessage {
  type: 'state';
  tickCount: number;
  /** Cumulative since the simulation started; diffed client-side into a per-second rate for #40's Births & deaths tab. */
  totalBirths: number;
  totalDeaths: number;
  width: number;
  height: number;
  entities: WireEntity[];
}

/**
 * The two Settings fields the Averages tab needs to turn an organic's raw age/size into
 * the same 0-1 ratios its own instruction-matrix sensors read (see engine/phases.ts's
 * evaluateSensor). Settings never changes after the worker starts, so this is posted
 * once up front rather than repeated on every SnapshotMessage.
 */
export interface WorkerSettings {
  type: 'settings';
  maxAge: number;
  maxSize: number;
}

export type WorkerResponse = SnapshotMessage | WorkerSettings;
