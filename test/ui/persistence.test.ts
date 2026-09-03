import { describe, expect, it } from 'vitest';
import { SIMULATION_STATE_VERSION, SimulationState } from '../../src/engine/simulation';
import { defaultSettings } from '../../src/engine/settings';
import { isSimulationState, parseSnapshot } from '../../src/ui/persistence';

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
