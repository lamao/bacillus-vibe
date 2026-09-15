import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyRecordedInput, Replay, REPLAY_VERSION } from '../../src/engine/replay';
import { Simulation, SIMULATION_STATE_VERSION, SimulationState } from '../../src/engine/simulation';
import {
  ExportedState,
  RecordedReplayMessage,
  ReplayFinished,
  SimulationSnapshot,
  WORKER_LOOP_FPS,
  WorkerRequest,
  WorkerResponse,
} from '../../src/worker/protocol';
import { dna, organic, testSettings } from '../engine/fixtures';

/** Matches simulation-worker.ts's own SNAPSHOT_INTERVAL_MS (not exported), the automatic loop()'s setInterval period. */
const SNAPSHOT_INTERVAL_MS = 1000 / WORKER_LOOP_FPS;

/**
 * Drives the actual worker module's message-handling logic (`self.onmessage`) directly,
 * with `self.postMessage` captured into `messages` instead of crossing a real Worker
 * boundary — this is the same code path the browser exercises, just without the DOM/thread
 * plumbing around it, so it can catch bugs in `simulation-worker.ts` itself (as opposed to
 * `src/engine/replay.ts`, which `test/engine/replay.test.ts` already covers directly).
 */
interface WorkerHarness {
  send: (message: WorkerRequest) => void;
  messages: WorkerResponse[];
}

/** Last message of the given `WorkerResponse` variant (there can be several, e.g. one `'settings'` per update) — ES2020's target lib has no `Array.prototype.findLast`. */
function lastOfType<T extends WorkerResponse>(messages: WorkerResponse[], type: T['type']): T | undefined {
  const matches = messages.filter((m): m is T => m.type === type);
  return matches[matches.length - 1];
}

async function loadWorker(): Promise<WorkerHarness> {
  const messages: WorkerResponse[] = [];
  const selfStub: {
    postMessage: (message: WorkerResponse) => void;
    onmessage: ((event: MessageEvent) => void) | null;
  } = {
    postMessage: (message) => messages.push(message),
    onmessage: null,
  };
  vi.stubGlobal('self', selfStub);
  // The module keeps its simulation in top-level `let`s, so a fresh import is needed per
  // test to avoid one test's worker state leaking into the next.
  vi.resetModules();
  await import('../../src/worker/simulation-worker');
  return {
    send: (message) => selfStub.onmessage!({ data: message } as MessageEvent),
    messages,
  };
}

function baseState(overrides: Partial<SimulationState> = {}): SimulationState {
  return {
    version: SIMULATION_STATE_VERSION,
    settings: testSettings({ width: 6, height: 6 }),
    rngState: 123,
    tickCount: 0,
    idCounter: 0,
    totalBirths: 0,
    totalDeaths: 0,
    entities: [],
    ...overrides,
  };
}

describe('simulation-worker recording/replay (#33)', () => {
  beforeEach(() => {
    // The module starts a real setInterval(loop, ...) on import; faking timers (and never
    // advancing them) keeps that automatic tick loop from ever firing so every tick in
    // these tests comes from an explicit 'stepOnce' message instead.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("freezes the replay's initial state at startRecording time, not at stopRecording time", async () => {
    const worker = await loadWorker();

    const seedOrganic = organic({ x: 1, y: 1 }, { dna: dna(), age: 0, energy: 500 });
    worker.send({ type: 'importState', state: baseState({ entities: [seedOrganic] }) });
    worker.send({ type: 'startRecording' });

    // Ticks that happen *after* recording starts mutate this very organic object in place
    // (exhaust ages it, consumption drains it) — before the recording is ever stopped.
    for (let i = 0; i < 5; i++) worker.send({ type: 'stepOnce' });

    worker.send({ type: 'stopRecording' });

    const recorded = lastOfType<RecordedReplayMessage>(worker.messages, 'recordedReplay');
    expect(recorded).toBeDefined();
    const initial = recorded!.replay.initialState;

    // The captured initial state must describe the simulation the instant recording
    // started (tick 0, the organic's original age/energy) — not however it happened to
    // look 5 ticks later, when the recording was finally stopped and serialized. Before
    // the fix, `initialState` aliased the live `Simulation`'s settings/entities, so these
    // would incorrectly show the *post-tick* values while `tickCount`/`rngState` (plain
    // numbers, copied by value) still correctly said "tick 0" — an internally
    // inconsistent replay that looks like it "plays randomly" once reloaded.
    expect(initial.tickCount).toBe(0);
    const restoredOrganic = initial.entities.find((e) => e.kind === 'organic');
    expect(restoredOrganic?.kind).toBe('organic');
    if (restoredOrganic?.kind === 'organic') {
      expect(restoredOrganic.age).toBe(0);
      expect(restoredOrganic.energy).toBe(500);
    }
  });

  it('the exported replay, replayed through the plain engine API, reproduces the trajectory the worker actually ran', async () => {
    const worker = await loadWorker();

    worker.send({ type: 'importState', state: baseState({ rngState: 42 }) });
    worker.send({ type: 'startRecording' });
    worker.send({ type: 'spawnRandomOrganic' });
    for (let i = 0; i < 3; i++) worker.send({ type: 'stepOnce' });
    worker.send({ type: 'spawnOrganicAt', position: { x: 4, y: 4 } });
    for (let i = 0; i < 3; i++) worker.send({ type: 'stepOnce' });
    worker.send({ type: 'stopRecording' });
    worker.send({ type: 'exportState' });

    const recorded = lastOfType<RecordedReplayMessage>(worker.messages, 'recordedReplay')!;
    const exported = lastOfType<ExportedState>(worker.messages, 'exportedState')!;
    const replay: Replay = recorded.replay;

    // Replay the exported artifact purely against the engine, with no dependency on the
    // worker at all — mirroring exactly what the worker's own `importReplay` + tick loop
    // does internally.
    const reconstructed = Simulation.fromState(replay.initialState);
    const queue = [...replay.inputs].sort((a, b) => a.tick - b.tick);
    const applyDue = (): void => {
      while (queue.length > 0 && queue[0].tick === reconstructed.tickCount) {
        applyRecordedInput(reconstructed, queue.shift()!);
      }
    };
    applyDue();
    while (reconstructed.tickCount < replay.endTick) {
      reconstructed.step();
      applyDue();
    }

    expect(reconstructed.tickCount).toBe(exported.state.tickCount);
    expect(reconstructed.grid.entities()).toEqual(exported.state.entities);
    expect(reconstructed.totalBirths).toBe(exported.state.totalBirths);
    expect(reconstructed.totalDeaths).toBe(exported.state.totalDeaths);
  });

  it('stops the automatically-ticking simulation exactly at the replay\'s recorded end, however much real time passes', async () => {
    const worker = await loadWorker();

    worker.send({ type: 'importState', state: baseState({ rngState: 55 }) });
    const replay: Replay = {
      version: REPLAY_VERSION,
      initialState: baseState({ rngState: 55 }),
      inputs: [],
      endTick: 4,
    };
    worker.send({ type: 'importReplay', replay });

    // Left running (never paused) with plenty of real time to work with — at the default
    // 60 ticks/s and a ~60Hz loop(), each interval firing accumulates about one tick, so
    // 20 firings is far more than the 4 ticks the replay actually calls for.
    vi.advanceTimersByTime(SNAPSHOT_INTERVAL_MS * 20);

    const snapshotsAfterFirstBurst = worker.messages.filter((m): m is SimulationSnapshot => m.type === 'state');
    const finishedMessages = worker.messages.filter((m): m is ReplayFinished => m.type === 'replayFinished');
    expect(snapshotsAfterFirstBurst[snapshotsAfterFirstBurst.length - 1].tickCount).toBe(4);
    expect(finishedMessages).toHaveLength(1);

    // Advancing a great deal more real time must not resume ticking (it stays paused
    // internally, exactly like a user-initiated pause would) or re-fire 'replayFinished'.
    vi.advanceTimersByTime(SNAPSHOT_INTERVAL_MS * 200);
    const snapshotsAfterSecondBurst = worker.messages.filter((m): m is SimulationSnapshot => m.type === 'state');
    const finishedMessagesAfterSecondBurst = worker.messages.filter((m): m is ReplayFinished => m.type === 'replayFinished');
    expect(snapshotsAfterSecondBurst[snapshotsAfterSecondBurst.length - 1].tickCount).toBe(4);
    expect(finishedMessagesAfterSecondBurst).toHaveLength(1);
  });
});

describe('simulation-worker god mode (#30)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('spawnMineralAt places a mineral and records it while recording is active', async () => {
    const worker = await loadWorker();
    worker.send({ type: 'importState', state: baseState() });
    worker.send({ type: 'startRecording' });
    worker.send({ type: 'spawnMineralAt', position: { x: 2, y: 2 }, substance: 'Blue', size: 400 });
    worker.send({ type: 'stopRecording' });

    const recorded = lastOfType<RecordedReplayMessage>(worker.messages, 'recordedReplay')!;
    expect(recorded.replay.inputs).toContainEqual({
      tick: 0,
      type: 'spawnMineralAt',
      position: { x: 2, y: 2 },
      substance: 'Blue',
      size: 400,
    });

    worker.send({ type: 'exportState' });
    const exported = lastOfType<ExportedState>(worker.messages, 'exportedState')!;
    expect(exported.state.entities).toContainEqual({ kind: 'mineral', position: { x: 2, y: 2 }, substance: 'Blue', size: 400 });
  });

  it('erase clears a cell and records it while recording is active', async () => {
    const worker = await loadWorker();
    const seedOrganic = organic({ x: 3, y: 3 }, { dna: dna() });
    worker.send({ type: 'importState', state: baseState({ entities: [seedOrganic] }) });
    worker.send({ type: 'startRecording' });
    worker.send({ type: 'erase', position: { x: 3, y: 3 } });
    worker.send({ type: 'stopRecording' });

    const recorded = lastOfType<RecordedReplayMessage>(worker.messages, 'recordedReplay')!;
    expect(recorded.replay.inputs).toContainEqual({ tick: 0, type: 'erase', position: { x: 3, y: 3 } });

    worker.send({ type: 'exportState' });
    const exported = lastOfType<ExportedState>(worker.messages, 'exportedState')!;
    expect(exported.state.entities.some((e) => e.position.x === 3 && e.position.y === 3)).toBe(false);
  });
});
