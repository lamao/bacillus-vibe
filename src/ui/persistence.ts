import { SIMULATION_STATE_VERSION, SimulationState } from '../engine/simulation';

const STORAGE_KEY = 'petri:save-v1';

/**
 * Structural check for data coming from outside the app (localStorage, an imported file)
 * before it's trusted as a `SimulationState` and handed to the worker — catches corrupted
 * JSON, a save from an incompatible future version, or an unrelated file the user picked
 * by mistake. Doesn't validate every nested field (e.g. each entity's shape): a JSON parse
 * failure or a wrong top-level shape covers the realistic "not a Petri save" cases, and the
 * worker only ever loads what this app itself exported.
 */
export function isSimulationState(value: unknown): value is SimulationState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === SIMULATION_STATE_VERSION &&
    typeof v.settings === 'object' &&
    v.settings !== null &&
    typeof v.rngState === 'number' &&
    typeof v.tickCount === 'number' &&
    typeof v.idCounter === 'number' &&
    typeof v.totalBirths === 'number' &&
    typeof v.totalDeaths === 'number' &&
    Array.isArray(v.entities)
  );
}

/** Parses save data from a file/localStorage read, returning null (never throwing) on invalid JSON or shape. */
export function parseSnapshot(json: string): SimulationState | null {
  try {
    const parsed: unknown = JSON.parse(json);
    return isSimulationState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * `localStorage` access can throw rather than just being empty — Chrome does this when
 * cookies/site data are blocked for the page's origin (privacy settings, some embedded/
 * sandboxed contexts), and private-browsing quota limits can trip `setItem` too. Both
 * functions below report that as a normal failure (`false`/`null`) rather than an uncaught
 * exception, so the Save/Load buttons can show a real "didn't work" message instead of
 * silently doing nothing.
 */
export function saveToLocalStorage(state: SimulationState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** Reads back the quick-resume save written by {@link saveToLocalStorage}, or null if there is none, it's unreadable, or storage access failed. */
export function loadFromLocalStorage(): SimulationState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? null : parseSnapshot(raw);
  } catch {
    return null;
  }
}

/** Triggers a browser download of `state` as a shareable JSON file (#29's file-export path). */
export function downloadSnapshot(state: SimulationState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = `petri-save-tick${state.tickCount}.json`;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
