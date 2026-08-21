import { DefaultRNG } from '../engine/rng';
import { defaultSettings } from '../engine/settings';
import { Simulation } from '../engine/simulation';
import { WorkerRequest, SimulationSnapshot } from './protocol';

const INITIAL_POPULATION = 150;

/** Caps how much simulated time one loop iteration can catch up on, so a throttled/backgrounded worker doesn't burst-run thousands of ticks at once. */
const MAX_CATCH_UP_SECONDS = 0.25;

/** How often the worker posts a render snapshot to the main thread, independent of tick rate. */
const SNAPSHOT_INTERVAL_MS = 1000 / 60;

const settings = defaultSettings();
const simulation = new Simulation(settings, new DefaultRNG());
for (let i = 0; i < INITIAL_POPULATION; i++) {
  simulation.spawnRandomOrganic();
}

let paused = false;
let ticksPerSecond = 60;
let tickAccumulator = 0;
let lastLoopTime: number | null = null;

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
}

function loop(): void {
  const now = performance.now();
  const elapsedSeconds = Math.min(MAX_CATCH_UP_SECONDS, (now - (lastLoopTime ?? now)) / 1000);
  lastLoopTime = now;

  if (!paused) {
    tickAccumulator += elapsedSeconds * ticksPerSecond;
    while (tickAccumulator >= 1) {
      simulation.step();
      tickAccumulator -= 1;
    }
  }

  postSnapshot();
}

postSnapshot();
setInterval(loop, SNAPSHOT_INTERVAL_MS);
