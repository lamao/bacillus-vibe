import { randomDNA } from './engine/dna';
import { DefaultRNG } from './engine/rng';
import { defaultSettings } from './engine/settings';
import { Simulation } from './engine/simulation';
import { Action, Position, Substance, substanceOf } from './engine/types';
import { Renderer, SUBSTANCE_COLORS } from './ui/renderer';
import './style.css';

function formatAction(action: Action): string {
  switch (action.type) {
    case 'Move':
      return `Move (${action.mode})`;
    case 'Produce':
      return `Produce (${action.mode})`;
    case 'Split':
      return `Split (${action.mode})`;
    case 'Rest':
      return 'Rest';
  }
}

const INITIAL_POPULATION = 150;
const MAX_TICKS_PER_FRAME = 30;

const canvas = document.querySelector<HTMLCanvasElement>('#grid-canvas');
const pauseBtn = document.querySelector<HTMLButtonElement>('#pause-btn');
const addBtn = document.querySelector<HTMLButtonElement>('#add-btn');
const inspectBtn = document.querySelector<HTMLButtonElement>('#inspect-btn');
const inspectorEl = document.querySelector<HTMLElement>('#inspector');
const speedInput = document.querySelector<HTMLInputElement>('#speed');
const speedLabel = document.querySelector<HTMLElement>('#speed-value');
const statsEl = document.querySelector<HTMLElement>('#stats');
const canvasWrap = document.querySelector<HTMLElement>('#canvas-wrap');
const hintEl = document.querySelector<HTMLElement>('#hint');

if (
  !canvas ||
  !pauseBtn ||
  !addBtn ||
  !inspectBtn ||
  !inspectorEl ||
  !speedInput ||
  !speedLabel ||
  !statsEl ||
  !canvasWrap ||
  !hintEl
) {
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
let inspectMode = false;
let inspectedCell: Position | null = null;

// A ResizeObserver (rather than only window 'resize'/'orientationchange') tracks
// canvas-wrap's actual box, so the canvas stays correctly sized even when layout
// shifts for reasons other than a viewport resize (e.g. the footer wrapping onto
// an extra line as controls are added, or font/content changes).
const resizeCanvas = (): void => {
  const rect = canvasWrap.getBoundingClientRect();
  renderer.resize(rect.width, rect.height);
};
new ResizeObserver(resizeCanvas).observe(canvasWrap);
resizeCanvas();

pauseBtn.addEventListener('click', () => {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
});

addBtn.addEventListener('click', () => {
  simulation.spawnRandomOrganic();
});

inspectBtn.addEventListener('click', () => {
  inspectMode = !inspectMode;
  inspectBtn.setAttribute('aria-pressed', String(inspectMode));
  inspectBtn.textContent = inspectMode ? 'Inspecting…' : 'Inspect';
  canvas.classList.toggle('inspecting', inspectMode);
  hintEl.textContent = inspectMode ? 'Tap a cell to inspect it' : 'Tap the grid to add a creature';
  if (!inspectMode) inspectedCell = null;
});

speedInput.addEventListener('input', () => {
  ticksPerFrame = Math.min(MAX_TICKS_PER_FRAME, Number(speedInput.value));
  speedLabel.textContent = `${ticksPerFrame}x`;
});
speedLabel.textContent = `${ticksPerFrame}x`;

canvas.addEventListener('pointerdown', (event: PointerEvent) => {
  const cell = renderer.cellFromClientPoint(event.clientX, event.clientY, simulation.grid);
  if (!cell) return;
  if (inspectMode) {
    inspectedCell = cell;
  } else {
    simulation.spawnOrganicAt(cell, randomDNA(rng));
  }
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

interface InspectorRow {
  label: string;
  value: string;
  swatchColor?: string;
}

const renderInspector = (): void => {
  if (!inspectMode || !inspectedCell) {
    inspectorEl.classList.add('hidden');
    return;
  }

  const entity = simulation.grid.get(inspectedCell.x, inspectedCell.y);
  const rows: InspectorRow[] = [{ label: 'Cell', value: `${inspectedCell.x}, ${inspectedCell.y}` }];

  if (!entity) {
    rows.push({ label: 'Empty', value: '—' });
  } else {
    const substance = substanceOf(entity);
    rows.push(
      { label: 'Kind', value: entity.kind },
      { label: 'Substance', value: substance, swatchColor: SUBSTANCE_COLORS[substance] },
      { label: 'Size', value: Math.round(entity.size).toString() },
    );
    if (entity.kind === 'organic') {
      rows.push(
        { label: 'Energy', value: Math.round(entity.energy).toString() },
        { label: 'Age', value: entity.age.toString() },
        { label: 'Waste', value: Math.round(entity.accumulatedWaste).toString() },
        { label: 'Body', value: entity.dna.body },
        { label: 'Consume', value: entity.dna.consume },
        { label: 'Produce', value: entity.dna.produce },
        { label: 'Toxin', value: entity.dna.toxin },
        { label: 'Moves', value: entity.dna.canMove ? 'yes' : 'no' },
        { label: 'State', value: entity.currentState.toString() },
        { label: 'Action', value: entity.chosenAction ? formatAction(entity.chosenAction) : '—' },
      );
    }
  }

  const dl = document.createElement('dl');
  for (const row of rows) {
    const dt = document.createElement('dt');
    dt.textContent = row.label;
    const dd = document.createElement('dd');
    if (row.swatchColor) {
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.backgroundColor = row.swatchColor;
      dd.appendChild(swatch);
    }
    dd.appendChild(document.createTextNode(row.value));
    dl.appendChild(dt);
    dl.appendChild(dd);
  }
  inspectorEl.replaceChildren(dl);
  inspectorEl.classList.remove('hidden');
};

const frame = (): void => {
  if (!paused) {
    for (let i = 0; i < ticksPerFrame; i++) simulation.step();
  }
  renderer.draw(simulation.grid);
  statsEl.textContent = formatStats();
  renderInspector();
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
