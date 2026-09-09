import { SCENARIO_PRESETS, buildScenario } from '../engine/presets';
import { applyRecordedInput, RecordedInput, Replay, REPLAY_VERSION } from '../engine/replay';
import { SeededRNG } from '../engine/rng';
import { defaultSettings } from '../engine/settings';
import { Simulation, SimulationState } from '../engine/simulation';
import {
  WORKER_LOOP_FPS,
  WorkerRequest,
  ExportedState,
  RecordedReplayMessage,
  RecordingStatus,
  ReplayFinished,
  SimulationSnapshot,
  WorkerSettings,
} from './protocol';

const INITIAL_POPULATION = 150;

/**
 * Caps how much simulated-time debt `tickAccumulator` may ever hold, so it can never
 * grow unboundedly when the target tick rate outpaces what the worker can actually
 * compute. Without this cap, running at a high rate for a while (more debt added per
 * call than the tick budget below can drain) builds a backlog that a later, lower
 * ticksPerSecond can't shrink — since a lower rate only slows how much MORE debt gets
 * added, it doesn't touch what's already queued, so the sim keeps running flat-out
 * until that backlog empties instead of actually slowing down. Recomputed from the
 * current ticksPerSecond every call, so lowering the target also lowers the cap and
 * the backlog gets clamped down (not drained down) within one call.
 *
 * The cap is floored at 1 tick's worth (see MIN_ACCUMULATOR_CAP below): at the two
 * slowest presets (1-2 ticks/s), 0.25 * ticksPerSecond is below 1, which would make
 * tickAccumulator mathematically unable to ever reach the >= 1 threshold that lets a
 * tick run at all — stalling the simulation completely instead of just slowing it down.
 */
const MAX_CATCH_UP_SECONDS = 0.25;
const MIN_ACCUMULATOR_CAP = 1;

/** How often the worker posts a render snapshot to the main thread, independent of tick rate. */
const SNAPSHOT_INTERVAL_MS = 1000 / WORKER_LOOP_FPS;

/**
 * Caps how long one `loop()` invocation may spend ticking, regardless of how large a
 * backlog `tickAccumulator` holds. Without this, a large population + high tick rate
 * can build a backlog whose ticks (and their snapshot posts) take, in total, far longer
 * than one `setInterval` period to drain — during which the worker's single JS thread
 * never returns to its event loop, so it can't process incoming control messages
 * (pause, speed, spawn) either. Any backlog left over after the budget runs out simply
 * carries over to the next `loop()` call instead of being forced through in one go.
 */
const TICK_BUDGET_MS = SNAPSHOT_INTERVAL_MS / 2;

// Reassigned wholesale by 'importState' (#29), which replaces the running simulation —
// settings included, since a loaded save may have different grid dimensions — rather than
// mutating either in place.
let settings = defaultSettings();
let simulation = new Simulation(settings, new SeededRNG());
for (let i = 0; i < INITIAL_POPULATION; i++) {
  simulation.spawnRandomOrganic();
}

let paused = false;
let ticksPerSecond = 60;
let tickAccumulator = 0;
let lastLoopTime: number | null = null;
let lastPostTime: number | null = null;

// Replay recording (#33): while `recording` is true, every spawnRandomOrganic/
// spawnOrganicAt/updateSettings message is appended to `recordedInputs` (tagged with the
// tick already completed at that point) on top of `recordingInitialState`, the snapshot
// taken the moment recording started. `stopRecording` packages the two into a `Replay`.
let recording = false;
let recordingInitialState: SimulationState | null = null;
let recordedInputs: RecordedInput[] = [];

// Replay playback: a loaded replay's inputs, sorted ascending by tick and consumed from
// the front as the simulation's tickCount catches up to each one — reusing the normal
// tick loop (and its pause/speed/step controls) rather than a separate fast-forward path.
let replayQueue: RecordedInput[] = [];
let replayActive = false;

function recordInput(input: RecordedInput): void {
  if (!recording) return;
  recordedInputs.push(input);
  postRecordingStatus();
}

/** Ends any in-progress recording without exporting it — used when the base simulation is replaced wholesale (import/preset), which invalidates the recording's initial state. */
function cancelRecording(): void {
  if (!recording) return;
  recording = false;
  recordingInitialState = null;
  recordedInputs = [];
  postRecordingStatus();
}

function postRecordingStatus(): void {
  const status: RecordingStatus = { type: 'recordingStatus', recording, recordedCount: recordedInputs.length };
  self.postMessage(status);
}

/** Applies every replay input due at the simulation's current tick, in order; posts settings if any changed the live tuning panel needs to reflect. */
function applyDueReplayInputs(): void {
  let settingsChanged = false;
  while (replayQueue.length > 0 && replayQueue[0].tick === simulation.tickCount) {
    const input = replayQueue.shift()!;
    applyRecordedInput(simulation, input);
    if (input.type === 'updateSettings') settingsChanged = true;
  }
  if (settingsChanged) postSettings();
  if (replayActive && replayQueue.length === 0) {
    replayActive = false;
    const finished: ReplayFinished = { type: 'replayFinished' };
    self.postMessage(finished);
  }
}

self.onmessage = (event: MessageEvent) => {
  const message = event.data as WorkerRequest;
  switch (message.type) {
    case 'setPaused':
      paused = message.paused;
      break;
    case 'setTicksPerSecond':
      ticksPerSecond = message.ticksPerSecond;
      break;
    case 'spawnRandomOrganic':
      recordInput({ tick: simulation.tickCount, type: 'spawnRandomOrganic' });
      simulation.spawnRandomOrganic();
      break;
    case 'spawnOrganicAt':
      recordInput({ tick: simulation.tickCount, type: 'spawnOrganicAt', position: message.position });
      simulation.spawnOrganicAt(message.position);
      break;
    case 'stepOnce':
      // Runs even while paused: `paused` only gates the automatic loop() below, and a
      // manual step should work regardless of the current tick-rate/accumulator state.
      simulation.step();
      applyDueReplayInputs();
      postSnapshot();
      break;
    case 'exportState': {
      const exported: ExportedState = { type: 'exportedState', state: simulation.toState() };
      self.postMessage(exported);
      break;
    }
    case 'importState':
      // A wholesale replacement invalidates both an in-progress recording (its initial
      // state is gone) and any pending replay script (its tick numbers no longer apply).
      cancelRecording();
      replayQueue = [];
      replayActive = false;
      settings = message.state.settings;
      simulation = Simulation.fromState(message.state);
      // The old backlog belongs to a simulation that no longer exists; starting the
      // restored one at zero avoids an immediate catch-up burst of ticks.
      tickAccumulator = 0;
      postSettings();
      postSnapshot();
      break;
    case 'applyPreset': {
      const preset = SCENARIO_PRESETS.find((p) => p.id === message.presetId);
      if (!preset) break;
      cancelRecording();
      replayQueue = [];
      replayActive = false;
      simulation = buildScenario(preset);
      settings = simulation.settings;
      // Same reasoning as 'importState': the old backlog belonged to the replaced simulation.
      tickAccumulator = 0;
      postSettings();
      postSnapshot();
      break;
    }
    case 'updateSettings':
      recordInput({ tick: simulation.tickCount, type: 'updateSettings', settings: message.settings });
      // Mutates the object `simulation.settings` already holds a reference to, rather than
      // replacing it — every phase function reads settings fresh each tick, so this takes
      // effect on the very next tick with no simulation restart.
      Object.assign(settings, message.settings);
      postSettings();
      break;
    case 'startRecording':
      recording = true;
      recordingInitialState = simulation.toState();
      recordedInputs = [];
      postRecordingStatus();
      break;
    case 'stopRecording': {
      if (!recording || !recordingInitialState) break;
      const replay: Replay = { version: REPLAY_VERSION, initialState: recordingInitialState, inputs: recordedInputs };
      const recorded: RecordedReplayMessage = { type: 'recordedReplay', replay, endTick: simulation.tickCount };
      self.postMessage(recorded);
      recording = false;
      recordingInitialState = null;
      recordedInputs = [];
      postRecordingStatus();
      break;
    }
    case 'importReplay':
      cancelRecording();
      settings = message.replay.initialState.settings;
      simulation = Simulation.fromState(message.replay.initialState);
      replayQueue = [...message.replay.inputs].sort((a, b) => a.tick - b.tick);
      replayActive = true;
      tickAccumulator = 0;
      applyDueReplayInputs();
      postSettings();
      postSnapshot();
      break;
  }
};

function postSnapshot(): void {
  const snapshot: SimulationSnapshot = {
    type: 'state',
    tickCount: simulation.tickCount,
    totalBirths: simulation.totalBirths,
    totalDeaths: simulation.totalDeaths,
    width: settings.width,
    height: settings.height,
    entities: simulation.grid.entities(),
  };
  self.postMessage(snapshot);
  lastPostTime = performance.now();
}

/** Posts a snapshot only if a render interval's worth of wall-clock time has passed since the last one — keeps a fast tick batch from flooding postMessage, without ever waiting on more than one render interval's worth of slow ticks. */
function postSnapshotIfDue(): void {
  const now = performance.now();
  if (lastPostTime === null || now - lastPostTime >= SNAPSHOT_INTERVAL_MS) {
    postSnapshot();
  }
}

function loop(): void {
  const now = performance.now();
  // No need to clamp this: however large a single call's elapsed real time is (e.g. a
  // backgrounded/throttled tab), the tickAccumulator clamp below bounds the result the
  // same way regardless.
  const elapsedSeconds = (now - (lastLoopTime ?? now)) / 1000;
  lastLoopTime = now;

  if (!paused) {
    const accumulatorCap = Math.max(MIN_ACCUMULATOR_CAP, MAX_CATCH_UP_SECONDS * ticksPerSecond);
    tickAccumulator = Math.min(tickAccumulator + elapsedSeconds * ticksPerSecond, accumulatorCap);
    const budgetEnd = now + TICK_BUDGET_MS;
    while (tickAccumulator >= 1 && performance.now() < budgetEnd) {
      simulation.step();
      applyDueReplayInputs();
      tickAccumulator -= 1;
      // Posted per tick (not just once after the batch) so a slow tick still shows up as
      // soon as it completes, instead of waiting for the whole catch-up batch to finish.
      postSnapshotIfDue();
    }
  }

  postSnapshotIfDue();
}

/** Posts the current Settings (see WorkerSettings' doc) — on startup, after a wholesale replacement, and after a live edit. */
function postSettings(): void {
  const settingsMessage: WorkerSettings = { type: 'settings', settings };
  self.postMessage(settingsMessage);
}

// Sent before the first postSnapshot() so it's guaranteed to arrive first (postMessage
// preserves send order on a single channel).
postSettings();
postSnapshot();
setInterval(loop, SNAPSHOT_INTERVAL_MS);
