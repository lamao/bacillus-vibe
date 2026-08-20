import { randomDNA } from './engine/dna';
import { DefaultRNG } from './engine/rng';
import { defaultSettings } from './engine/settings';
import { Simulation } from './engine/simulation';
import { Substance } from './engine/types';
import { Renderer } from './ui/renderer';
import './style.css';

const INITIAL_POPULATION = 150;
const MAX_TICKS_PER_FRAME = 30;

const canvas = document.querySelector<HTMLCanvasElement>('#grid-canvas');
const pauseBtn = document.querySelector<HTMLButtonElement>('#pause-btn');
const addBtn = document.querySelector<HTMLButtonElement>('#add-btn');
const speedInput = document.querySelector<HTMLInputElement>('#speed');
const speedLabel = document.querySelector<HTMLElement>('#speed-value');
const statsEl = document.querySelector<HTMLElement>('#stats');
const canvasWrap = document.querySelector<HTMLElement>('#canvas-wrap');

if (!canvas || !pauseBtn || !addBtn || !speedInput || !speedLabel || !statsEl || !canvasWrap) {
  throw new Error('Petri: expected page elements were not found');
}

const rng = new DefaultRNG();
const settings = defaultSettings();
const simulation = new Simulation(settings, rng);
for (let i = 0; i < INITIAL_POPULATION; i++) {
  simulation.spawnRandomOrganic();
}

const renderer = new Renderer(canvas);

let paused = false;
let ticksPerFrame = Number(speedInput.value);

function resizeCanvas(): void {
  const rect = canvasWrap!.getBoundingClientRect();
  renderer.resize(rect.width, rect.height);
}
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', resizeCanvas);
resizeCanvas();

pauseBtn.addEventListener('click', () => {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
});

addBtn.addEventListener('click', () => {
  simulation.spawnRandomOrganic();
});

speedInput.addEventListener('input', () => {
  ticksPerFrame = Math.min(MAX_TICKS_PER_FRAME, Number(speedInput.value));
  speedLabel.textContent = `${ticksPerFrame}x`;
});
speedLabel.textContent = `${ticksPerFrame}x`;

canvas.addEventListener('pointerdown', (event: PointerEvent) => {
  const cell = renderer.cellFromClientPoint(event.clientX, event.clientY, simulation.grid);
  if (cell) simulation.spawnOrganicAt(cell, randomDNA(rng));
});

function formatStats(): string {
  const organics = simulation.grid.organics();
  const counts = new Map<Substance, number>();
  for (const organic of organics) {
    counts.set(organic.dna.body, (counts.get(organic.dna.body) ?? 0) + 1);
  }
  const breakdown = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([substance, count]) => `${substance} ${count}`)
    .join(' · ');
  const suffix = breakdown ? ` · ${breakdown}` : '';
  return `Tick ${simulation.tickCount} · Population ${organics.length}${suffix}`;
}

const frame = (): void => {
  if (!paused) {
    for (let i = 0; i < ticksPerFrame; i++) simulation.step();
  }
  renderer.draw(simulation.grid);
  statsEl.textContent = formatStats();
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
