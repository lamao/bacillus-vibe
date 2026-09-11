import { REPLAY_VERSION, Replay } from '../engine/replay';
import { isSimulationState } from './persistence';

/**
 * Structural check for a replay file picked from disk, mirroring `isSimulationState`'s
 * reasoning: catches corrupted data, a replay from an incompatible future version, or an
 * unrelated file, without validating every individual `inputs` entry's shape — the worker
 * only ever loads what this app itself exported.
 */
export function isReplay(value: unknown): value is Replay {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.version === REPLAY_VERSION && isSimulationState(v.initialState) && Array.isArray(v.inputs);
}

/** Parses a replay file, returning null (never throwing) on invalid JSON or shape. */
export function parseReplay(json: string): Replay | null {
  try {
    const parsed: unknown = JSON.parse(json);
    return isReplay(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Triggers a browser download of `replay` as a shareable JSON file (#33). */
export function downloadReplay(replay: Replay, endTick: number): void {
  const blob = new Blob([JSON.stringify(replay, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = `petri-replay-tick${endTick}.json`;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
