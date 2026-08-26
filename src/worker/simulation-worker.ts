import { DefaultRNG } from '../engine/rng';
import { defaultSettings } from '../engine/settings';
import { Simulation } from '../engine/simulation';
import { WORKER_LOOP_FPS, WorkerRequest, SnapshotMessage, WireEntity, WorkerSettings } from './protocol';

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
/**
 * Ids of organics whose `dna.behavior` was included in the most recently posted snapshot —
 * i.e. every organic currently alive as of that post. Compared against on the next post to
 * decide which organics are newly-seen (their `behavior` needs sending) versus already-known
 * (it can be omitted, see `WireDNA` in `./protocol`); replaced wholesale each time rather than
 * only ever grown, so a dead organic's id naturally drops out instead of leaking forever.
 */
let organicIdsSentWithBehavior = new Set<number>();

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
    case 'stepOnce':
      // Runs even while paused: `paused` only gates the automatic loop() below, and a
      // manual step should work regardless of the current tick-rate/accumulator state.
      simulation.step();
      postSnapshot();
      break;
  }
};

/** Builds this snapshot's wire entities, including `behavior` only for organics not present in `organicIdsSentWithBehavior`, then replaces it with exactly this snapshot's living organic ids. */
function buildWireEntities(): WireEntity[] {
  const aliveOrganicIds = new Set<number>();
  const entities: WireEntity[] = simulation.grid.entities().map((entity) => {
    if (entity.kind === 'mineral') return entity;
    aliveOrganicIds.add(entity.id);
    const { behavior, ...dnaRest } = entity.dna;
    const isNewlySeen = !organicIdsSentWithBehavior.has(entity.id);
    return { ...entity, dna: isNewlySeen ? { ...dnaRest, behavior } : dnaRest };
  });
  organicIdsSentWithBehavior = aliveOrganicIds;
  return entities;
}

function postSnapshot(): void {
  const snapshot: SnapshotMessage = {
    type: 'state',
    tickCount: simulation.tickCount,
    totalBirths: simulation.totalBirths,
    totalDeaths: simulation.totalDeaths,
    width: settings.width,
    height: settings.height,
    entities: buildWireEntities(),
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
      tickAccumulator -= 1;
      // Posted per tick (not just once after the batch) so a slow tick still shows up as
      // soon as it completes, instead of waiting for the whole catch-up batch to finish.
      postSnapshotIfDue();
    }
  }

  postSnapshotIfDue();
}

// Settings never changes after this, so it's posted once up front rather than repeated
// on every snapshot; sent before the first postSnapshot() so it's guaranteed to arrive
// first (postMessage preserves send order on a single channel).
const settingsMessage: WorkerSettings = { type: 'settings', maxAge: settings.maxAge, maxSize: settings.maxSize };
self.postMessage(settingsMessage);

postSnapshot();
setInterval(loop, SNAPSHOT_INTERVAL_MS);
