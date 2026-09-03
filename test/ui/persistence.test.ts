import { afterEach, describe, expect, it } from 'vitest';
import { SIMULATION_STATE_VERSION, SimulationState } from '../../src/engine/simulation';
import { defaultSettings } from '../../src/engine/settings';
import { isSimulationState, loadQuickResume, parseSnapshot, saveQuickResume } from '../../src/ui/persistence';

function validState(): SimulationState {
  return {
    version: SIMULATION_STATE_VERSION,
    settings: defaultSettings(5, 5),
    rngState: 42,
    tickCount: 3,
    idCounter: 1,
    totalBirths: 0,
    totalDeaths: 0,
    entities: [],
  };
}

describe('isSimulationState', () => {
  it('accepts a well-formed state', () => {
    expect(isSimulationState(validState())).toBe(true);
  });

  it('rejects null and non-objects', () => {
    expect(isSimulationState(null)).toBe(false);
    expect(isSimulationState('a save file')).toBe(false);
    expect(isSimulationState(42)).toBe(false);
  });

  it('rejects a mismatched version (e.g. a future save format)', () => {
    expect(isSimulationState({ ...validState(), version: SIMULATION_STATE_VERSION + 1 })).toBe(false);
  });

  it('rejects a state missing a required field', () => {
    const { rngState: _rngState, ...withoutRngState } = validState();
    expect(isSimulationState(withoutRngState)).toBe(false);
  });

  it('rejects a state whose entities field is not an array', () => {
    expect(isSimulationState({ ...validState(), entities: 'not an array' })).toBe(false);
  });
});

describe('parseSnapshot', () => {
  it('parses a well-formed save file', () => {
    const state = validState();
    expect(parseSnapshot(JSON.stringify(state))).toEqual(state);
  });

  it('returns null for invalid JSON rather than throwing', () => {
    expect(parseSnapshot('{not json')).toBeNull();
  });

  it('returns null for valid JSON that is not a simulation state', () => {
    expect(parseSnapshot(JSON.stringify({ hello: 'world' }))).toBeNull();
  });
});

/**
 * Just enough of an in-memory IndexedDB stand-in to exercise `saveQuickResume`/
 * `loadQuickResume`'s open -> transaction -> objectStore -> put/get chain — the test
 * environment (`vite.config.ts`'s `environment: 'node'`) has no real `indexedDB` global.
 * Not a spec-complete IDBFactory; only the calls this module actually makes, plus a way to
 * make `indexedDB.open` itself fail (mimicking a browser that blocks IndexedDB entirely).
 */
function installMockIndexedDb(options: { openFails?: boolean } = {}): void {
  const store = new Map<string, unknown>();

  class FakeRequest<T> {
    onsuccess: (() => void) | null = null;
    onerror: (() => void) | null = null;
    result!: T;
    error: Error | null = null;
    succeed(result: T): void {
      this.result = result;
      queueMicrotask(() => this.onsuccess?.());
    }
    fail(error: Error): void {
      this.error = error;
      queueMicrotask(() => this.onerror?.());
    }
  }

  class FakeObjectStore {
    put(value: unknown, key: string): FakeRequest<unknown> {
      const request = new FakeRequest<unknown>();
      store.set(key, value);
      request.succeed(undefined);
      return request;
    }
    get(key: string): FakeRequest<unknown> {
      const request = new FakeRequest<unknown>();
      request.succeed(store.get(key));
      return request;
    }
  }

  class FakeDatabase {
    transaction(): { objectStore: () => FakeObjectStore } {
      return { objectStore: () => new FakeObjectStore() };
    }
    close(): void {}
  }

  const fakeIndexedDb = {
    open(): FakeRequest<FakeDatabase> {
      const request = new FakeRequest<FakeDatabase>();
      if (options.openFails) {
        request.fail(new Error('IndexedDB unavailable'));
      } else {
        request.succeed(new FakeDatabase());
      }
      return request;
    },
  };

  Object.defineProperty(globalThis, 'indexedDB', { value: fakeIndexedDb, configurable: true, writable: true });
}

describe('saveQuickResume / loadQuickResume', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'indexedDB');
  });

  it('round-trips a state through IndexedDB', async () => {
    installMockIndexedDb();
    const state = validState();
    await expect(saveQuickResume(state)).resolves.toBe(true);
    await expect(loadQuickResume()).resolves.toEqual(state);
  });

  it('resolves null from loadQuickResume when nothing has been saved yet', async () => {
    installMockIndexedDb();
    await expect(loadQuickResume()).resolves.toBeNull();
  });

  it('resolves false (never rejects) when the database cannot be opened', async () => {
    installMockIndexedDb({ openFails: true });
    await expect(saveQuickResume(validState())).resolves.toBe(false);
  });

  it('resolves null (never rejects) from loadQuickResume when the database cannot be opened', async () => {
    installMockIndexedDb({ openFails: true });
    await expect(loadQuickResume()).resolves.toBeNull();
  });
});
