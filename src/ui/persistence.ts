import { SIMULATION_STATE_VERSION, SimulationState } from '../engine/simulation';

/**
 * Structural check for data coming from outside the app (IndexedDB, an imported file)
 * before it's trusted as a `SimulationState` and handed to the worker — catches corrupted
 * data, a save from an incompatible future version, or an unrelated file the user picked
 * by mistake. Doesn't validate every nested field (e.g. each entity's shape): a wrong
 * top-level shape covers the realistic "not a Petri save" cases, and the worker only ever
 * loads what this app itself exported.
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

/** Parses save data from an imported file, returning null (never throwing) on invalid JSON or shape. */
export function parseSnapshot(json: string): SimulationState | null {
  try {
    const parsed: unknown = JSON.parse(json);
    return isSimulationState(parsed) ? parsed : null;
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

/**
 * Quick-resume storage (#29's Save/Load, as opposed to Export/Import's files) uses
 * IndexedDB rather than `localStorage`. A snapshot's `entities` array carries every
 * organic's full 25-entry instruction matrix, so a long-running default (80x80) grid's
 * JSON easily reaches several megabytes and a full grid's over twenty — comfortably past
 * `localStorage`'s ~5-10MB per-origin quota (confirmed by an actual `QuotaExceededError`
 * on save). IndexedDB's quota is tied to available disk space instead, and stores the
 * state via structured clone directly (no JSON string round-trip needed).
 */
const DB_NAME = 'petri';
const DB_VERSION = 1;
const STORE_NAME = 'saves';
/** Single fixed key: this is a one-slot "quick resume" save, not a save-file browser. */
const QUICK_RESUME_KEY = 'quick-resume';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error as Error);
  });
}

/** Wraps an already-issued `IDBRequest` in a Promise settling on its `success`/`error` events. */
function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error as Error);
  });
}

/** Saves `state` as the single quick-resume slot, overwriting any previous one. Never throws — resolves false on failure. */
export async function saveQuickResume(state: SimulationState): Promise<boolean> {
  try {
    const db = await openDb();
    try {
      await requestToPromise(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(state, QUICK_RESUME_KEY));
      return true;
    } finally {
      db.close();
    }
  } catch (err) {
    console.error('Petri: could not save', err);
    return false;
  }
}

/** Reads back the quick-resume save written by {@link saveQuickResume}, or null if there is none or storage access failed. */
export async function loadQuickResume(): Promise<SimulationState | null> {
  try {
    const db = await openDb();
    try {
      const value = await requestToPromise(db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(QUICK_RESUME_KEY));
      return isSimulationState(value) ? value : null;
    } finally {
      db.close();
    }
  } catch (err) {
    console.error('Petri: could not load', err);
    return null;
  }
}
