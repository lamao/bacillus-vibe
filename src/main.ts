import {
  Action,
  Entity,
  INSTRUCTION_MATRIX_SIZE,
  Instruction,
  MoveMode,
  Organic,
  Position,
  ProduceMode,
  Substance,
  substanceOf,
} from './engine/types';
import { Renderer, SUBSTANCE_COLORS } from './ui/renderer';
import { SimulationSnapshot, WorkerRequest, WorkerResponse } from './worker/protocol';
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

/** Flat category colors for the instruction matrix grid, loosely following SUBSTANCE_COLORS. */
const ACTION_COLORS: Record<Action['type'], string> = {
  Move: '#4f8cff',
  Produce: '#eab308',
  Split: '#22c55e',
  Rest: '#3a4258',
};

const MOVE_MODE_ABBR: Record<MoveMode, string> = {
  TowardConsume: 'C',
  AwayFromToxin: 'T',
  TowardOpenSpace: 'O',
  Random: 'R',
  Hold: 'H',
};

const PRODUCE_MODE_ABBR: Record<ProduceMode, string> = {
  Release: 'R',
  Hold: 'H',
};

/** Compact per-cell label for the instruction matrix grid, e.g. "Mv·C", "Pr·R", "Spl", "Rst". */
function formatCellLabel(instruction: Instruction): string {
  switch (instruction.action.type) {
    case 'Move':
      return `Mv·${MOVE_MODE_ABBR[instruction.action.mode]}`;
    case 'Produce':
      return `Pr·${PRODUCE_MODE_ABBR[instruction.action.mode]}`;
    case 'Split':
      return 'Spl';
    case 'Rest':
      return 'Rst';
  }
}

function formatThreshold(threshold: number): string {
  return Number(threshold.toFixed(2)).toString();
}

/**
 * Discrete tick-rate presets in ticks per second, spaced roughly geometrically
 * so each slider step feels proportionally faster — from a watchable 1 tick/s
 * up to 1800 (the previous fastest speed: 30 ticks/frame at 60fps).
 */
const TICK_RATE_PRESETS = [1, 2, 5, 10, 20, 40, 60, 120, 250, 500, 1000, 1800];
const DEFAULT_TICK_RATE_INDEX = TICK_RATE_PRESETS.indexOf(60);

function formatTickRate(ticksPerSecond: number): string {
  return ticksPerSecond === 1 ? '1 tick/s' : `${ticksPerSecond} ticks/s`;
}

const canvas = document.querySelector<HTMLCanvasElement>('#grid-canvas');
const pauseBtn = document.querySelector<HTMLButtonElement>('#pause-btn');
const addBtn = document.querySelector<HTMLButtonElement>('#add-btn');
const inspectBtn = document.querySelector<HTMLButtonElement>('#inspect-btn');
const inspectorEl = document.querySelector<HTMLElement>('#inspector');
const inspectorContentEl = document.querySelector<HTMLElement>('#inspector-content');
const inspectorCloseBtn = document.querySelector<HTMLButtonElement>('#inspector-close');
const speedInput = document.querySelector<HTMLInputElement>('#speed');
const speedLabel = document.querySelector<HTMLElement>('#speed-value');
const statsEl = document.querySelector<HTMLElement>('#stats');
const canvasWrap = document.querySelector<HTMLElement>('#canvas-wrap');
const hintEl = document.querySelector<HTMLElement>('#hint');
const buildInfoEl = document.querySelector<HTMLElement>('#build-info');

if (
  !canvas ||
  !pauseBtn ||
  !addBtn ||
  !inspectBtn ||
  !inspectorEl ||
  !inspectorContentEl ||
  !inspectorCloseBtn ||
  !speedInput ||
  !speedLabel ||
  !statsEl ||
  !canvasWrap ||
  !hintEl ||
  !buildInfoEl
) {
  throw new Error('Petri: expected page elements were not found');
}

buildInfoEl.textContent = __BUILD_ID__;
buildInfoEl.title = `Build ${__BUILD_ID__}`;

// The simulation itself (grid, settings, RNG, tick loop) runs off the main thread in a
// Worker, so rendering stays smooth even when population/speed makes ticking expensive.
// The worker pushes a state snapshot roughly once per its own render-loop iteration; the
// main thread only ever reads the latest one and never mutates simulation state directly.
const worker = new Worker(new URL('./worker/simulation-worker.ts', import.meta.url), { type: 'module' });
const postToWorker = (message: WorkerRequest): void => worker.postMessage(message);

let latestSnapshot: SimulationSnapshot | null = null;
let entityByPosition = new Map<string, Entity>();

worker.onmessage = (event: MessageEvent) => {
  const message = event.data as WorkerResponse;
  latestSnapshot = message;
  entityByPosition = new Map(message.entities.map((entity) => [`${entity.position.x},${entity.position.y}`, entity]));
};

const renderer = new Renderer(canvas);

let paused = false;
let ticksPerSecond = TICK_RATE_PRESETS[DEFAULT_TICK_RATE_INDEX];
let inspectMode = false;
let inspectedCell: Position | null = null;
/** Instruction matrix state tapped for detail in the inspector; reset whenever a new cell is inspected. */
let selectedStateIndex: number | null = null;

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
  postToWorker({ type: 'setPaused', paused });
});

addBtn.addEventListener('click', () => {
  postToWorker({ type: 'spawnRandomOrganic' });
});

/** Turns off inspect mode and hides the inspector, however it was entered. */
const exitInspectMode = (): void => {
  inspectMode = false;
  inspectBtn.setAttribute('aria-pressed', 'false');
  inspectBtn.textContent = 'Inspect';
  canvas.classList.remove('inspecting');
  hintEl.textContent = 'Tap the grid to add a creature';
  inspectedCell = null;
  selectedStateIndex = null;
};

inspectBtn.addEventListener('click', () => {
  if (inspectMode) {
    exitInspectMode();
    return;
  }
  inspectMode = true;
  inspectBtn.setAttribute('aria-pressed', 'true');
  inspectBtn.textContent = 'Inspecting…';
  canvas.classList.add('inspecting');
  hintEl.textContent = 'Tap a cell to inspect it';
});

inspectorCloseBtn.addEventListener('click', exitInspectMode);

speedInput.min = '0';
speedInput.max = String(TICK_RATE_PRESETS.length - 1);
speedInput.step = '1';
speedInput.value = String(DEFAULT_TICK_RATE_INDEX);

speedInput.addEventListener('input', () => {
  ticksPerSecond = TICK_RATE_PRESETS[Number(speedInput.value)];
  speedLabel.textContent = formatTickRate(ticksPerSecond);
  postToWorker({ type: 'setTicksPerSecond', ticksPerSecond });
});
speedLabel.textContent = formatTickRate(ticksPerSecond);

canvas.addEventListener('pointerdown', (event: PointerEvent) => {
  if (!latestSnapshot) return;
  const cell = renderer.cellFromClientPoint(event.clientX, event.clientY, latestSnapshot);
  if (!cell) return;
  if (inspectMode) {
    inspectedCell = cell;
    selectedStateIndex = null;
  } else {
    postToWorker({ type: 'spawnOrganicAt', position: cell });
  }
});

function formatStats(): string {
  const organics = (latestSnapshot?.entities ?? []).filter((entity): entity is Organic => entity.kind === 'organic');
  const counts = new Map<Substance, number>();
  for (const organic of organics) {
    counts.set(organic.dna.body, (counts.get(organic.dna.body) ?? 0) + 1);
  }
  const breakdown = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([substance, count]) => `${substance} ${count}`)
    .join(' · ');
  const suffix = breakdown ? ` · ${breakdown}` : '';
  return `Tick ${latestSnapshot?.tickCount ?? 0} · Population ${organics.length}${suffix}`;
}

interface InspectorRow {
  label: string;
  value: string;
  swatchColor?: string;
}

function buildDl(rows: InspectorRow[]): HTMLDListElement {
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
  return dl;
}

/**
 * Builds the 5x5 instruction-matrix grid for an organic, plus a detail box below
 * it showing the tapped/current-highlighted cell's full instruction. Rebuilt (and
 * its click handlers re-bound) every render, since the inspector's whole subtree
 * is replaced each tick to keep the highlighted cell tracking `currentState` live.
 */
function buildMatrixSection(entity: Organic): HTMLElement {
  const section = document.createElement('div');
  section.className = 'matrix-section';

  const grid = document.createElement('div');
  grid.className = 'matrix-grid';
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', 'Instruction matrix');

  for (let i = 0; i < INSTRUCTION_MATRIX_SIZE; i++) {
    const instruction = entity.dna.behavior[i];
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'matrix-cell';
    cell.style.backgroundColor = ACTION_COLORS[instruction.action.type];
    cell.textContent = formatCellLabel(instruction);
    cell.title = `State ${i}: ${formatAction(instruction.action)}`;
    if (i === entity.currentState) {
      cell.classList.add('current');
      cell.setAttribute('aria-current', 'true');
    }
    if (i === selectedStateIndex) {
      cell.classList.add('selected');
    }
    cell.addEventListener('click', () => {
      selectedStateIndex = selectedStateIndex === i ? null : i;
      renderInspector();
    });
    grid.appendChild(cell);
  }
  section.appendChild(grid);

  const detail = document.createElement('div');
  detail.className = 'matrix-detail';
  if (selectedStateIndex === null) {
    const hint = document.createElement('p');
    hint.className = 'matrix-hint';
    hint.textContent = 'Tap a cell for its instruction';
    detail.appendChild(hint);
  } else {
    const instruction = entity.dna.behavior[selectedStateIndex];
    detail.appendChild(
      buildDl([
        { label: 'State', value: selectedStateIndex.toString() },
        { label: 'Action', value: formatAction(instruction.action) },
        {
          label: 'Test',
          value: `${instruction.sensor} ${instruction.comparator} ${formatThreshold(instruction.threshold)}`,
        },
        { label: 'Jump', value: `${instruction.jumpOffset >= 0 ? '+' : ''}${instruction.jumpOffset}` },
      ]),
    );
  }
  section.appendChild(detail);

  return section;
}

/**
 * Fingerprint of the last rendered inspector content, so `renderInspector` (called
 * every animation frame) only touches the DOM when something actually changed.
 * Without this, per-frame `replaceChildren` churn can swap a matrix-cell button out
 * from under a real click between its mousedown and mouseup.
 */
let lastRenderSignature: string | null = null;

const renderInspector = (): void => {
  if (!inspectMode || !inspectedCell) {
    inspectorEl.classList.add('hidden');
    lastRenderSignature = null;
    return;
  }

  const entity = entityByPosition.get(`${inspectedCell.x},${inspectedCell.y}`) ?? null;
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
      );
    }
  }

  const signature =
    JSON.stringify(rows) + (entity?.kind === 'organic' ? `|${entity.currentState}|${selectedStateIndex}` : '');
  if (signature !== lastRenderSignature) {
    lastRenderSignature = signature;
    const children: HTMLElement[] = [buildDl(rows)];
    if (entity?.kind === 'organic') {
      children.push(buildMatrixSection(entity));
    }
    inspectorContentEl.replaceChildren(...children);
  }
  inspectorEl.classList.remove('hidden');
};

const frame = (): void => {
  if (latestSnapshot) renderer.draw(latestSnapshot);
  statsEl.textContent = formatStats();
  renderInspector();
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
