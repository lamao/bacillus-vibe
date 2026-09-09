import { describe, expect, it } from 'vitest';
import { applyRecordedInput, REPLAY_VERSION, Replay } from '../../src/engine/replay';
import { SeededRNG } from '../../src/engine/rng';
import { Simulation } from '../../src/engine/simulation';
import { testSettings } from './fixtures';

describe('applyRecordedInput', () => {
  it('spawnRandomOrganic places a new organic', () => {
    const sim = new Simulation(testSettings(), new SeededRNG(1));
    expect(sim.grid.entities()).toHaveLength(0);
    applyRecordedInput(sim, { tick: 0, type: 'spawnRandomOrganic' });
    expect(sim.grid.entities()).toHaveLength(1);
  });

  it('spawnOrganicAt places an organic at the given position', () => {
    const sim = new Simulation(testSettings(), new SeededRNG(1));
    applyRecordedInput(sim, { tick: 0, type: 'spawnOrganicAt', position: { x: 4, y: 4 } });
    expect(sim.grid.get(4, 4)?.kind).toBe('organic');
  });

  it('updateSettings mutates the live settings object in place', () => {
    const sim = new Simulation(testSettings(), new SeededRNG(1));
    applyRecordedInput(sim, { tick: 0, type: 'updateSettings', settings: { mutationRate: 0.5 } });
    expect(sim.settings.mutationRate).toBe(0.5);
  });
});

/**
 * Mirrors what the worker actually does live: applies each recorded input the moment the
 * simulation's tickCount reaches it, interleaved with ticking. Used both to produce the
 * "live" run below and to drive replay from a `Replay`'s `initialState`, so the two paths
 * are proven to line up exactly.
 */
function runWithInputs(sim: Simulation, targetTick: number, inputs: Replay['inputs']): void {
  const queue = [...inputs].sort((a, b) => a.tick - b.tick);
  const applyDue = (): void => {
    while (queue.length > 0 && queue[0].tick === sim.tickCount) {
      applyRecordedInput(sim, queue.shift()!);
    }
  };
  applyDue();
  while (sim.tickCount < targetTick) {
    sim.step();
    applyDue();
  }
}

describe('Replay (#33)', () => {
  it('replaying a recorded run reproduces the live run byte-for-byte', () => {
    const settings = testSettings({ width: 12, height: 12 });
    const live = new Simulation(settings, new SeededRNG(42));

    const inputs: Replay['inputs'] = [
      { tick: 0, type: 'spawnRandomOrganic' },
      { tick: 0, type: 'spawnOrganicAt', position: { x: 1, y: 1 } },
      { tick: 5, type: 'updateSettings', settings: { mutationRate: 0.5 } },
      { tick: 12, type: 'spawnRandomOrganic' },
    ];

    // The initial save-state is captured before any input has been applied — same as the
    // worker's 'startRecording', which snapshots the running simulation at that instant.
    const initialState = live.toState();
    runWithInputs(live, 20, inputs);

    const replay: Replay = { version: REPLAY_VERSION, initialState, inputs };

    const restored = Simulation.fromState(replay.initialState);
    runWithInputs(restored, 20, replay.inputs);

    expect(restored.grid.entities()).toEqual(live.grid.entities());
    expect(restored.tickCount).toBe(live.tickCount);
    expect(restored.totalBirths).toBe(live.totalBirths);
    expect(restored.totalDeaths).toBe(live.totalDeaths);
    expect(restored.settings).toEqual(live.settings);
  });

  it('survives a full JSON round-trip (as an actual downloaded/re-imported file would)', () => {
    const settings = testSettings({ width: 8, height: 8 });
    const live = new Simulation(settings, new SeededRNG(7));
    const inputs: Replay['inputs'] = [{ tick: 0, type: 'spawnRandomOrganic' }];
    const initialState = live.toState();
    runWithInputs(live, 6, inputs);
    const replay: Replay = { version: REPLAY_VERSION, initialState, inputs };

    const roundTripped = JSON.parse(JSON.stringify(replay)) as Replay;
    const restored = Simulation.fromState(roundTripped.initialState);
    runWithInputs(restored, 6, roundTripped.inputs);

    expect(restored.grid.entities()).toEqual(live.grid.entities());
  });

  it('an input recorded at a later tick is applied only once the simulation catches up to it', () => {
    const sim = new Simulation(testSettings(), new SeededRNG(3));
    const queue: Replay['inputs'] = [{ tick: 3, type: 'spawnRandomOrganic' }];
    const applyDue = (): void => {
      while (queue.length > 0 && queue[0].tick === sim.tickCount) {
        applyRecordedInput(sim, queue.shift()!);
      }
    };
    applyDue();
    sim.step();
    sim.step();
    applyDue();
    expect(sim.grid.entities()).toHaveLength(0); // tick 2, input due at tick 3 — not yet applied
    sim.step();
    applyDue();
    expect(sim.grid.entities()).toHaveLength(1); // tick 3 reached — now applied
  });
});
