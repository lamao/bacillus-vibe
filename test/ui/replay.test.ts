import { describe, expect, it } from 'vitest';
import { REPLAY_VERSION, Replay } from '../../src/engine/replay';
import { SIMULATION_STATE_VERSION } from '../../src/engine/simulation';
import { defaultSettings } from '../../src/engine/settings';
import { isReplay, parseReplay } from '../../src/ui/replay';

function validReplay(): Replay {
  return {
    version: REPLAY_VERSION,
    initialState: {
      version: SIMULATION_STATE_VERSION,
      settings: defaultSettings(5, 5),
      rngState: 42,
      tickCount: 0,
      idCounter: 0,
      totalBirths: 0,
      totalDeaths: 0,
      entities: [],
    },
    inputs: [{ tick: 3, type: 'spawnRandomOrganic' }],
  };
}

describe('isReplay', () => {
  it('accepts a well-formed replay', () => {
    expect(isReplay(validReplay())).toBe(true);
  });

  it('rejects null and non-objects', () => {
    expect(isReplay(null)).toBe(false);
    expect(isReplay('a replay file')).toBe(false);
    expect(isReplay(42)).toBe(false);
  });

  it('rejects a mismatched version (e.g. a future replay format)', () => {
    expect(isReplay({ ...validReplay(), version: REPLAY_VERSION + 1 })).toBe(false);
  });

  it('rejects a replay whose initialState is not a valid simulation state', () => {
    expect(isReplay({ ...validReplay(), initialState: { not: 'a state' } })).toBe(false);
  });

  it('rejects a replay whose inputs field is not an array', () => {
    expect(isReplay({ ...validReplay(), inputs: 'not an array' })).toBe(false);
  });
});

describe('parseReplay', () => {
  it('parses a well-formed replay file', () => {
    const replay = validReplay();
    expect(parseReplay(JSON.stringify(replay))).toEqual(replay);
  });

  it('returns null for invalid JSON rather than throwing', () => {
    expect(parseReplay('{not json')).toBeNull();
  });

  it('returns null for valid JSON that is not a replay', () => {
    expect(parseReplay(JSON.stringify({ hello: 'world' }))).toBeNull();
  });
});
