import { afterEach, describe, expect, it } from 'vitest';
import { SIMULATION_STATE_VERSION, SimulationState } from '../../src/engine/simulation';
import { defaultSettings } from '../../src/engine/settings';
import { isSimulationState, loadFromLocalStorage, parseSnapshot, saveToLocalStorage } from '../../src/ui/persistence';

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
 * A minimal in-memory `Storage` stand-in — the test environment (`vitest.config.ts`'s
 * `environment: 'node'`) has no real `localStorage` global — that also lets individual
 * tests swap in a `setItem`/`getItem` that throws, mimicking Chrome's real (if unusual)
 * behavior when a page's site data/cookies are blocked (#29's Save/Load bug report).
 */
function installMockStorage(overrides: Partial<Pick<Storage, 'getItem' | 'setItem'>> = {}): void {
  const store = new Map<string, string>();
  const storage: Partial<Storage> = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    ...overrides,
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
}

describe('saveToLocalStorage / loadFromLocalStorage', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('round-trips a state through localStorage', () => {
    installMockStorage();
    const state = validState();
    expect(saveToLocalStorage(state)).toBe(true);
    expect(loadFromLocalStorage()).toEqual(state);
  });

  it('returns null from loadFromLocalStorage when nothing has been saved yet', () => {
    installMockStorage();
    expect(loadFromLocalStorage()).toBeNull();
  });

  it('returns false (not throw) when localStorage.setItem throws, e.g. blocked site data', () => {
    installMockStorage({
      setItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    expect(() => saveToLocalStorage(validState())).not.toThrow();
    expect(saveToLocalStorage(validState())).toBe(false);
  });

  it('returns null (not throw) when localStorage.getItem throws', () => {
    installMockStorage({
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    expect(() => loadFromLocalStorage()).not.toThrow();
    expect(loadFromLocalStorage()).toBeNull();
  });
});
