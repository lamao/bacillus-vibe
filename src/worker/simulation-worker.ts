import { DefaultRNG } from '../engine/rng';
import { defaultSettings } from '../engine/settings';
import { Simulation } from '../engine/simulation';
import { WorkerRequest, SimulationSnapshot } from './protocol';

const INITIAL_POPULATION = 150;

/** Caps how much simulated time one loop iteration can catch up on, so a throttled/backgrounded worker doesn't burst-run thousands of ticks at once. */
const MAX_CATCH_UP_SECONDS = 0.25;

/** How often the worker posts a render snapshot to the main thread, independent of tick rate. */
const SNAPSHOT_INTERVAL_MS = 1000 / 60;

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

const settings = defaultSettings();
const simulation = new Simulation(settings, new DefaultRNG());
for (let i = 0; i < INITIAL_POPULATION; i++) {
  simulation.spawnRandomOrganic();
}

let paused = false;
let ticksPerSecond = 60;
let tickAccumulator = 0;
let lastLoopTime: number | null = null;
let lastPostTime: number | null = null;

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
      simulation.spawnRandomOrganic();
      break;
    case 'spawnOrganicAt':
      simulation.spawnOrganicAt(message.position);
      break;
  }
};

function postSnapshot(): void {
  const snapshot: SimulationSnapshot = {
    type: 'state',
    tickCount: simulation.tickCount,
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
  const elapsedSeconds = Math.min(MAX_CATCH_UP_SECONDS, (now - (lastLoopTime ?? now)) / 1000);
  lastLoopTime = now;

  if (!paused) {
    tickAccumulator += elapsedSeconds * ticksPerSecond;
    const budgetEnd = now + TICK_BUDGET_MS;
    while (tickAccumulator >= 1 && performance.now() < budgetEnd) {
      simulation.step();
      tickAccumulator -= 1;
      // Posted per tick (not just once after the batch) so a slow tick still shows up as
      // soon as it completes, instead of waiting for the whole catch-up batch to finish.
      postSnapshotIfDue();
    }
  }

  postSnapshotIfDue();
}

postSnapshot();
setInterval(loop, SNAPSHOT_INTERVAL_MS);
