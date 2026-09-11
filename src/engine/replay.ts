import { Simulation, SimulationState } from './simulation';
import { TunableSettings } from './settings';
import { Position } from './types';

/** Bumped whenever {@link Replay}'s shape changes in a way old replay files can't be read as. */
export const REPLAY_VERSION = 1;

/**
 * One user interaction captured during recording (#33), tagged with the tick count the
 * simulation had already completed when it was applied. Deliberately mirrors only the
 * `WorkerRequest` variants that actually change simulation trajectory — pause/speed/
 * step/export controls don't touch engine state and have nothing to replay.
 */
export type RecordedInput =
  | { tick: number; type: 'spawnRandomOrganic' }
  | { tick: number; type: 'spawnOrganicAt'; position: Position }
  | { tick: number; type: 'updateSettings'; settings: Partial<TunableSettings> };

/**
 * A shareable recording of a run (#33): the initial save-state (seed + settings + initial
 * grid, from #29's `SimulationState`) plus a log of every interaction that happened after
 * it, each tagged with the tick it occurred at. Replaying means rebuilding the `Simulation`
 * from `initialState` and stepping it forward, applying each `inputs` entry the moment the
 * simulation reaches its tick — byte-for-byte identical to the original run, since the
 * engine is fully deterministic given a seed (`test/engine/determinism.test.ts`) and every
 * random draw an interaction itself makes (e.g. `spawnRandomOrganic`'s position/DNA) comes
 * from the same `Simulation.rng` stream, consumed in the same order it was live.
 */
export interface Replay {
  version: number;
  initialState: SimulationState;
  inputs: RecordedInput[];
}

/** Applies one recorded interaction directly to `simulation`, the same effect it had live. */
export function applyRecordedInput(simulation: Simulation, input: RecordedInput): void {
  switch (input.type) {
    case 'spawnRandomOrganic':
      simulation.spawnRandomOrganic();
      break;
    case 'spawnOrganicAt':
      simulation.spawnOrganicAt(input.position);
      break;
    case 'updateSettings':
      Object.assign(simulation.settings, input.settings);
      break;
  }
}
