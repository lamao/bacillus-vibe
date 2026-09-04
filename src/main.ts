import {
  Action,
  Entity,
  INSTRUCTION_MATRIX_SIZE,
  MoveMode,
  Organic,
  PHYSICAL_SUBSTANCES,
  Position,
  ProduceMode,
  Substance,
  substanceOf,
} from './engine/types';
import { SCENARIO_PRESETS } from './engine/presets';
import { computeAverageRatios, ZERO_AVERAGE_RATIOS } from './ui/averages';
import { downloadSnapshot, loadQuickResume, parseSnapshot, saveQuickResume } from './ui/persistence';
import { Renderer, SUBSTANCE_COLORS } from './ui/renderer';
import { StatsDrawer } from './ui/statsDrawer';
import { computeStatCounts, StatCounts } from './ui/stats';
import { computeTrend, Trend } from './ui/trend';
import { RENDER_FPS, SimulationSnapshot, WorkerRequest, WorkerResponse } from './worker/protocol';
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

/** Icon (see ICON_DEFS_SVG below) filling each instruction matrix cell, keyed by action type. */
const ACTION_ICON: Record<Action['type'], string> = {
  Move: 'ic-move',
  Produce: 'ic-produce',
  Split: 'ic-split',
  Rest: 'ic-rest',
};

/**
 * Corner-badge icon layered on top of the action icon for the modes that have one.
 * Move's Hold deliberately reuses Rest's pause-bars icon rather than a distinct glyph,
 * since both mean "stay put this state".
 */
const MOVE_MODE_ICON: Record<MoveMode, string> = {
  TowardConsume: 'ic-target',
  AwayFromToxin: 'ic-hazard',
  TowardOpenSpace: 'ic-open',
  Random: 'ic-random',
  Hold: 'ic-rest',
};

const PRODUCE_MODE_ICON: Record<ProduceMode, string> = {
  Release: 'ic-release',
  Hold: 'ic-lock',
};

/** Mode badge icon id for an action, or null for Split/Rest which have no mode. */
function modeIconFor(action: Action): string | null {
  switch (action.type) {
    case 'Move':
      return MOVE_MODE_ICON[action.mode];
    case 'Produce':
      return PRODUCE_MODE_ICON[action.mode];
    case 'Split':
    case 'Rest':
      return null;
  }
}

/** One-line descriptions for the icon legend popup; not needed for the matrix cells themselves. */
const ACTION_DESCRIPTIONS: Record<Action['type'], string> = {
  Move: 'Steps to a neighbour cell',
  Produce: 'Converts food into waste',
  Split: 'Divides into a new organic',
  Rest: 'Does nothing this state',
};

const MOVE_MODE_DESCRIPTIONS: Record<MoveMode, string> = {
  TowardConsume: 'Steps toward its food substance',
  AwayFromToxin: 'Steps away from what damages it',
  TowardOpenSpace: 'Heads for the emptiest neighbour cell',
  Random: 'Picks any open neighbour cell',
  Hold: 'Stays put this state',
};

const PRODUCE_MODE_DESCRIPTIONS: Record<ProduceMode, string> = {
  Release: 'Expels waste into the cell',
  Hold: 'Retains waste in the body',
};

/**
 * Sprite sheet of every instruction-matrix icon, injected once into the document so
 * `<use href="#ic-...">` can reference them cheaply from many cells without repeating
 * path data. Kept hidden (not display:none, which some browsers exclude from `<use>`
 * lookups) via zero size + absolute positioning.
 */
const ICON_DEFS_SVG = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <symbol id="ic-move" viewBox="0 0 24 24">
      <path d="M6 18 L18 6 M18 6 H10 M18 6 V14" />
    </symbol>
    <symbol id="ic-produce" viewBox="0 0 24 24">
      <rect x="3" y="16.3" width="18" height="4.2" rx="2.1" />
      <rect x="5" y="12.8" width="14" height="3.9" rx="1.95" />
      <clipPath id="ic-produce-clip-1">
        <rect x="0" y="0" width="24" height="10.5" />
      </clipPath>
      <clipPath id="ic-produce-clip-2">
        <rect x="0" y="0" width="24" height="9.5" />
      </clipPath>
      <g transform="translate(0 2.6)">
        <g transform="translate(12 6) scale(1 0.8) translate(-12 -6)">
          <g clip-path="url(#ic-produce-clip-2)">
            <g clip-path="url(#ic-produce-clip-1)" transform="translate(0 1.5)">
              <path
                d="M12.00,1.80 C15.57,4.43 16.20,6.99 16.20,9.30 A4.20,4.20 0 1 1 7.80,9.30 C7.80,6.99 8.43,4.43 12.00,1.80 Z"
                transform="translate(12 9.3) scale(-1 0.7) translate(-12 -9.3) rotate(-18 12 9.3)"
              />
            </g>
          </g>
        </g>
      </g>
    </symbol>
    <symbol id="ic-split" viewBox="0 0 24 24">
      <circle cx="8" cy="12" r="4.3" />
      <circle cx="16" cy="12" r="4.3" />
      <path d="M11.6 12 H12.4" />
    </symbol>
    <symbol id="ic-rest" viewBox="0 0 24 24">
      <path d="M8.5 5.5 V18.5 M15.5 5.5 V18.5" />
    </symbol>
    <symbol id="ic-target" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </symbol>
    <symbol id="ic-hazard" viewBox="0 0 24 24">
      <path d="M12 4.2 L20.5 19 H3.5 Z" />
      <path d="M12 10 V14" />
      <circle cx="12" cy="16.7" r="0.9" fill="currentColor" stroke="none" />
    </symbol>
    <symbol id="ic-open" viewBox="0 0 24 24">
      <path d="M8 4.5 H4.5 V8" />
      <path d="M16 4.5 H19.5 V8" />
      <path d="M8 19.5 H4.5 V16" />
      <path d="M16 19.5 H19.5 V16" />
    </symbol>
    <symbol id="ic-random" viewBox="0 0 24 24">
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="16" cy="8" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="8" cy="16" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1.6" fill="currentColor" stroke="none" />
    </symbol>
    <symbol id="ic-release" viewBox="0 0 24 24">
      <path d="M12 12 L17 7 M17 7 H12.5 M17 7 V11.5" />
      <path d="M12 12 L7 17 M7 17 H11.5 M7 17 V12.5" />
    </symbol>
    <symbol id="ic-lock" viewBox="0 0 24 24">
      <rect x="6.5" y="10.5" width="11" height="9" rx="1.6" />
      <path d="M9 10.5 V7.8 A3 3 0 0 1 15 7.8 V10.5" />
    </symbol>
    <symbol id="ic-pause" viewBox="0 0 24 24">
      <path d="M8.5 5.5 V18.5 M15.5 5.5 V18.5" />
    </symbol>
    <symbol id="ic-play" viewBox="0 0 24 24">
      <path d="M7 4.5 L19 12 L7 19.5 Z" />
    </symbol>
    <symbol id="ic-step" viewBox="0 0 24 24">
      <path d="M6 4.5 L16 12 L6 19.5 Z" />
      <path d="M18 4.5 V19.5" />
    </symbol>
    <symbol id="ic-plus" viewBox="0 0 24 24">
      <path d="M12 5 V19 M5 12 H19" />
    </symbol>
    <symbol id="ic-eye" viewBox="0 0 24 24">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </symbol>
    <symbol id="ic-speed" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 12 L16 8" />
      <path d="M12 4 V5.5 M20 12 H18.5 M4 12 H5.5" />
    </symbol>
    <symbol id="ic-menu" viewBox="0 0 24 24">
      <path d="M4 6 H20 M4 12 H20 M4 18 H14" />
    </symbol>
    <symbol id="ic-drawer" viewBox="0 0 24 24">
      <path d="M3 10 H21 M3 10 V19 A1 1 0 0 0 4 20 H20 A1 1 0 0 0 21 19 V10 M3 10 L5.5 5 H18.5 L21 10" />
    </symbol>
    <symbol id="ic-help" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8 V8.01 M11 12 H12 V17 H13" />
    </symbol>
    <symbol id="ic-save" viewBox="0 0 24 24">
      <path d="M5 4.5 H16 L19.5 8 V18.5 A1 1 0 0 1 18.5 19.5 H5.5 A1 1 0 0 1 4.5 18.5 V5.5 A1 1 0 0 1 5.5 4.5 Z" />
      <path d="M8 4.5 V9.5 H15 V4.5" />
      <path d="M8 19.5 V14.5 H16 V19.5" />
    </symbol>
    <symbol id="ic-folder" viewBox="0 0 24 24">
      <path d="M3.5 7.5 A1 1 0 0 1 4.5 6.5 H9.5 L11.5 8.5 H19.5 A1 1 0 0 1 20.5 9.5 V17.5 A1 1 0 0 1 19.5 18.5 H4.5 A1 1 0 0 1 3.5 17.5 Z" />
    </symbol>
    <symbol id="ic-download" viewBox="0 0 24 24">
      <path d="M12 4 V15 M8 11 L12 15 L16 11" />
      <path d="M4.5 17 V18.5 A1 1 0 0 0 5.5 19.5 H18.5 A1 1 0 0 0 19.5 18.5 V17" />
    </symbol>
    <symbol id="ic-upload" viewBox="0 0 24 24">
      <path d="M12 15 V4 M8 8 L12 4 L16 8" />
      <path d="M4.5 17 V18.5 A1 1 0 0 0 5.5 19.5 H18.5 A1 1 0 0 0 19.5 18.5 V17" />
    </symbol>
    <symbol id="ic-flask" viewBox="0 0 24 24">
      <path d="M9.5 3.5 H14.5 M10.2 3.5 V9.2 L4.9 18.4 A1.4 1.4 0 0 0 6.1 20.5 H17.9 A1.4 1.4 0 0 0 19.1 18.4 L13.8 9.2 V3.5" />
      <path d="M7.7 15 H16.3" />
    </symbol>
  </defs>
</svg>`;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Builds a `<svg><use></svg>` referencing one of ICON_DEFS_SVG's symbols. */
function buildIcon(iconId: string, className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${iconId}`);
  svg.appendChild(use);
  return svg;
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
const pauseIconUse = document.querySelector<SVGUseElement>('#pause-icon-use');
const ticBtn = document.querySelector<HTMLButtonElement>('#tic-btn');
const addBtn = document.querySelector<HTMLButtonElement>('#add-btn');
const inspectBtn = document.querySelector<HTMLButtonElement>('#inspect-btn');
const inspectorEl = document.querySelector<HTMLElement>('#inspector');
const inspectorContentEl = document.querySelector<HTMLElement>('#inspector-content');
const inspectorCloseBtn = document.querySelector<HTMLButtonElement>('#inspector-close');
const speedInput = document.querySelector<HTMLInputElement>('#speed');
const speedLabel = document.querySelector<HTMLElement>('#speed-value');
const statsEl = document.querySelector<HTMLElement>('#stats');
const perfEl = document.querySelector<HTMLElement>('#perf');
const canvasWrap = document.querySelector<HTMLElement>('#canvas-wrap');
const hintEl = document.querySelector<HTMLElement>('#hint');
const buildInfoEl = document.querySelector<HTMLElement>('#build-info');
const iconLegendEl = document.querySelector<HTMLElement>('#icon-legend');
const iconLegendBackdropEl = document.querySelector<HTMLElement>('#icon-legend-backdrop');
const iconLegendCloseBtn = document.querySelector<HTMLButtonElement>('#icon-legend-close');
const iconLegendContentEl = document.querySelector<HTMLElement>('#icon-legend-content');
const controlsMenuBtn = document.querySelector<HTMLButtonElement>('#controls-menu-btn');
const controlsMenuEl = document.querySelector<HTMLElement>('#controls-menu');
const menuDrawerToggle = document.querySelector<HTMLButtonElement>('#menu-drawer-toggle');
const menuLegendToggle = document.querySelector<HTMLButtonElement>('#menu-legend-toggle');
const menuScenarioListEl = document.querySelector<HTMLElement>('#menu-scenario-list');
const menuSaveBtn = document.querySelector<HTMLButtonElement>('#menu-save-btn');
const menuLoadBtn = document.querySelector<HTMLButtonElement>('#menu-load-btn');
const menuExportBtn = document.querySelector<HTMLButtonElement>('#menu-export-btn');
const menuImportBtn = document.querySelector<HTMLButtonElement>('#menu-import-btn');
const importFileInput = document.querySelector<HTMLInputElement>('#import-file-input');

if (
  !canvas ||
  !pauseBtn ||
  !pauseIconUse ||
  !ticBtn ||
  !addBtn ||
  !inspectBtn ||
  !inspectorEl ||
  !inspectorContentEl ||
  !inspectorCloseBtn ||
  !speedInput ||
  !speedLabel ||
  !statsEl ||
  !perfEl ||
  !canvasWrap ||
  !hintEl ||
  !buildInfoEl ||
  !iconLegendEl ||
  !iconLegendBackdropEl ||
  !iconLegendCloseBtn ||
  !iconLegendContentEl ||
  !controlsMenuBtn ||
  !controlsMenuEl ||
  !menuDrawerToggle ||
  !menuLegendToggle ||
  !menuScenarioListEl ||
  !menuSaveBtn ||
  !menuLoadBtn ||
  !menuExportBtn ||
  !menuImportBtn ||
  !importFileInput
) {
  throw new Error('Petri: expected page elements were not found');
}

document.body.insertAdjacentHTML('afterbegin', ICON_DEFS_SVG);

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
/** Id-keyed index of organics only (minerals have no stable id), so the inspector can keep following an organic as it moves. */
let organicById = new Map<number, Organic>();
/** Settings only changes wholesale on an import (#29), so this is refreshed from the worker's 'settings' message rather than resent with every snapshot. */
let engineSettings: { maxAge: number; maxSize: number } | null = null;
/** Which action a pending 'exportState' round-trip is for — the worker's reply is generic, so this remembers what to do once it arrives. */
let pendingExport: 'save' | 'download' | null = null;

worker.onmessage = (event: MessageEvent) => {
  const message = event.data as WorkerResponse;
  if (message.type === 'settings') {
    engineSettings = { maxAge: message.maxAge, maxSize: message.maxSize };
    return;
  }
  if (message.type === 'exportedState') {
    const action = pendingExport;
    pendingExport = null;
    if (action === 'save') {
      saveQuickResume(message.state).then((ok) => {
        flashHint(ok ? 'Saved' : 'Could not save (browser storage unavailable)');
      });
    } else if (action === 'download') {
      downloadSnapshot(message.state);
      flashHint('Exported');
    }
    return;
  }
  latestSnapshot = message;
  entityByPosition = new Map(message.entities.map((entity) => [`${entity.position.x},${entity.position.y}`, entity]));
  organicById = new Map(
    message.entities.filter((entity): entity is Organic => entity.kind === 'organic').map((entity) => [entity.id, entity]),
  );
};

const renderer = new Renderer(canvas);
const statsDrawer = new StatsDrawer();

let paused = false;
let ticksPerSecond = TICK_RATE_PRESETS[DEFAULT_TICK_RATE_INDEX];
let inspectMode = false;
/**
 * What the inspector is currently tracking. Tapping an organic tracks it by id so it
 * keeps being shown as it moves (see #46); tapping a mineral or empty cell tracks the
 * position instead, since minerals have no stable id but also never move.
 */
type InspectedTarget = { type: 'entity'; id: number } | { type: 'cell'; position: Position };
let inspectedTarget: InspectedTarget | null = null;
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

const togglePause = (): void => {
  paused = !paused;
  pauseIconUse.setAttribute('href', paused ? '#ic-play' : '#ic-pause');
  pauseBtn.title = paused ? 'Resume the simulation (Space)' : 'Pause the simulation (Space)';
  ticBtn.classList.toggle('hidden', !paused);
  postToWorker({ type: 'setPaused', paused });
};
pauseBtn.addEventListener('click', togglePause);

const stepOnce = (): void => {
  if (!paused) return;
  postToWorker({ type: 'stepOnce' });
};
ticBtn.addEventListener('click', stepOnce);

const addCreature = (): void => {
  postToWorker({ type: 'spawnRandomOrganic' });
};
addBtn.addEventListener('click', addCreature);

/** Toggles the static instruction-icon legend popup; its content is built once at startup, not per-render. */
const closeLegend = (): void => {
  iconLegendEl.classList.add('hidden');
};

const openLegend = (): void => {
  iconLegendEl.classList.remove('hidden');
};

const toggleLegend = (): void => {
  if (iconLegendEl.classList.contains('hidden')) openLegend();
  else closeLegend();
};

iconLegendCloseBtn.addEventListener('click', closeLegend);
iconLegendBackdropEl.addEventListener('click', closeLegend);
iconLegendContentEl.replaceChildren(buildLegendContent());

/**
 * Grouped popover (#71) anchored above the footer's Controls button, holding the view
 * toggles and the full shortcut list — everything that used to be hotkey-only with no
 * visible affordance. Reflects the stats drawer's/legend's actual state (rather than
 * tracking its own) so it stays correct even when either was toggled by its own hotkey
 * or, for the drawer, by clicking its bar directly.
 */
const closeControlsMenu = (): void => {
  controlsMenuEl.classList.add('hidden');
  controlsMenuBtn.setAttribute('aria-expanded', 'false');
};

const syncControlsMenu = (): void => {
  menuDrawerToggle.setAttribute('aria-checked', String(statsDrawer.isExpanded()));
  menuLegendToggle.setAttribute('aria-checked', String(!iconLegendEl.classList.contains('hidden')));
};

const openControlsMenu = (): void => {
  syncControlsMenu();
  controlsMenuEl.classList.remove('hidden');
  controlsMenuBtn.setAttribute('aria-expanded', 'true');
};

const toggleControlsMenu = (): void => {
  if (controlsMenuEl.classList.contains('hidden')) openControlsMenu();
  else closeControlsMenu();
};

controlsMenuBtn.addEventListener('click', (event) => {
  // Stops this click from also reaching the document-level listener below, which would
  // immediately close the menu this same click just opened.
  event.stopPropagation();
  toggleControlsMenu();
});

menuDrawerToggle.addEventListener('click', () => {
  statsDrawer.toggleExpanded();
  syncControlsMenu();
});

menuLegendToggle.addEventListener('click', () => {
  toggleLegend();
  syncControlsMenu();
});

// Closes the popover on any click outside it, same as a native dropdown menu — it never
// blocks interaction with the grid underneath (no backdrop), so a tap that both dismisses
// the menu and hits something else on the page (e.g. adds a creature) is expected.
document.addEventListener('click', (event) => {
  if (controlsMenuEl.classList.contains('hidden')) return;
  const target = event.target;
  if (target instanceof Node && (controlsMenuEl.contains(target) || controlsMenuBtn.contains(target))) return;
  closeControlsMenu();
});

/** What the hint text shows absent any transient message — depends on inspect mode. */
const defaultHint = (): string => (inspectMode ? 'Tap a cell to inspect it' : 'Tap the grid to add a creature');

/** Turns off inspect mode and hides the inspector, however it was entered. */
const exitInspectMode = (): void => {
  inspectMode = false;
  inspectBtn.setAttribute('aria-pressed', 'false');
  inspectBtn.title = 'Inspect cells on the grid (I)';
  canvas.classList.remove('inspecting');
  hintEl.textContent = defaultHint();
  inspectedTarget = null;
  selectedStateIndex = null;
  closeLegend();
};

const toggleInspectMode = (): void => {
  if (inspectMode) {
    exitInspectMode();
    return;
  }
  inspectMode = true;
  inspectBtn.setAttribute('aria-pressed', 'true');
  inspectBtn.title = 'Exit inspect mode (I)';
  canvas.classList.add('inspecting');
  hintEl.textContent = defaultHint();
};

/** Briefly shows a status message (e.g. "Saved") in the footer hint, reverting to the normal hint after a beat. */
let hintResetTimer: number | null = null;
const flashHint = (message: string): void => {
  hintEl.textContent = message;
  if (hintResetTimer !== null) window.clearTimeout(hintResetTimer);
  hintResetTimer = window.setTimeout(() => {
    hintEl.textContent = defaultHint();
    hintResetTimer = null;
  }, 1800);
};

/**
 * Scenario presets (#32): each row applies a named settings bundle + seeding recipe
 * (`src/engine/presets.ts`), replacing the running simulation wholesale — same one-shot
 * "act immediately, no confirmation" pattern as Save/Load below. Built from
 * `SCENARIO_PRESETS` rather than hand-written per preset, so this list and the engine's
 * stay in sync automatically.
 */
for (const preset of SCENARIO_PRESETS) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'controls-menu-row';
  row.setAttribute('role', 'menuitem');
  row.title = preset.description;
  row.appendChild(buildIcon('ic-flask', 'btn-icon'));
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = preset.name;
  row.appendChild(label);
  row.addEventListener('click', () => {
    postToWorker({ type: 'applyPreset', presetId: preset.id });
    flashHint(`Scenario: ${preset.name}`);
    closeControlsMenu();
  });
  menuScenarioListEl.appendChild(row);
}

/**
 * Save/load (#29): "Save"/"Load" round-trip a snapshot through this browser's localStorage
 * for quick resume; "Export"/"Import" round-trip it through a downloaded/picked JSON file
 * for sharing with someone else. Save/Load are also reachable via the Shift+S/L hotkeys
 * below, sharing these same functions. All four close the popover, matching a one-shot
 * menu action rather than a toggle.
 */
const doSave = (): void => {
  pendingExport = 'save';
  postToWorker({ type: 'exportState' });
  closeControlsMenu();
};

const doLoad = (): void => {
  closeControlsMenu();
  loadQuickResume().then((state) => {
    if (!state) {
      flashHint('No saved simulation found');
      return;
    }
    postToWorker({ type: 'importState', state });
    flashHint('Loaded');
  });
};

menuSaveBtn.addEventListener('click', doSave);

menuExportBtn.addEventListener('click', () => {
  pendingExport = 'download';
  postToWorker({ type: 'exportState' });
  closeControlsMenu();
});

menuLoadBtn.addEventListener('click', doLoad);

menuImportBtn.addEventListener('click', () => {
  importFileInput.click();
  closeControlsMenu();
});

importFileInput.addEventListener('change', () => {
  const file = importFileInput.files?.[0] ?? null;
  // Cleared so picking the same file again still fires 'change'.
  importFileInput.value = '';
  if (!file) return;
  file
    .text()
    .then((text) => {
      const state = parseSnapshot(text);
      if (!state) {
        flashHint('Invalid save file');
        return;
      }
      postToWorker({ type: 'importState', state });
      flashHint('Imported');
    })
    .catch(() => flashHint('Could not read file'));
});
inspectBtn.addEventListener('click', toggleInspectMode);

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

/** Nudges the speed slider by delta presets (e.g. from the -/= keyboard shortcuts), reusing its own 'input' handling. */
const bumpSpeed = (delta: number): void => {
  const nextIndex = Math.max(0, Math.min(TICK_RATE_PRESETS.length - 1, Number(speedInput.value) + delta));
  if (nextIndex === Number(speedInput.value)) return;
  speedInput.value = String(nextIndex);
  speedInput.dispatchEvent(new Event('input'));
};

canvas.addEventListener('pointerdown', (event: PointerEvent) => {
  if (!latestSnapshot) return;
  const cell = renderer.cellFromClientPoint(event.clientX, event.clientY, latestSnapshot);
  if (!cell) return;
  if (inspectMode) {
    const tapped = entityByPosition.get(`${cell.x},${cell.y}`);
    inspectedTarget = tapped?.kind === 'organic' ? { type: 'entity', id: tapped.id } : { type: 'cell', position: cell };
    selectedStateIndex = null;
  } else {
    postToWorker({ type: 'spawnOrganicAt', position: cell });
  }
});

/**
 * Global keyboard shortcuts for the footer/panel buttons above. Ignored while Ctrl/Cmd/Alt
 * is held (so browser/OS shortcuts like Cmd+A keep working) or while focus is on a form
 * control (there's currently only the speed slider, but this guards against future text
 * inputs too). Shift is not filtered out, since it's used for Save/Load's Shift+S/Shift+L
 * (kept consistent with each other, and distinguishing Shift+S from plain S's Step). Esc
 * closes whichever overlay is topmost: the legend modal first, then (since exiting inspect
 * mode already hides the inspector panel) inspect mode itself.
 */
window.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  if (target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

  // Keyed on event.code (the physical key's position) rather than event.key (the character
  // it produces) so shortcuts stay on the same physical keys regardless of active keyboard
  // layout — e.g. the S key still steps once when the user has switched to a Ukrainian
  // layout, even though that layout's event.key for that position is 'і'/'І', not 's'/'S'.
  switch (event.code) {
    case 'Space':
      event.preventDefault();
      togglePause();
      break;
    case 'KeyS':
      event.preventDefault();
      if (event.shiftKey) doSave();
      else stepOnce();
      break;
    case 'KeyL':
      if (!event.shiftKey) break;
      event.preventDefault();
      doLoad();
      break;
    case 'KeyA':
      event.preventDefault();
      addCreature();
      break;
    case 'KeyI':
      event.preventDefault();
      toggleInspectMode();
      break;
    case 'Equal':
      event.preventDefault();
      bumpSpeed(1);
      break;
    case 'Minus':
      event.preventDefault();
      bumpSpeed(-1);
      break;
    case 'KeyH':
      event.preventDefault();
      toggleLegend();
      syncControlsMenu();
      break;
    case 'KeyD':
      event.preventDefault();
      statsDrawer.toggleExpanded();
      syncControlsMenu();
      break;
    case 'BracketLeft':
      event.preventDefault();
      if (statsDrawer.isExpanded()) statsDrawer.paginate(-1);
      break;
    case 'BracketRight':
      event.preventDefault();
      if (statsDrawer.isExpanded()) statsDrawer.paginate(1);
      break;
    case 'Escape':
      event.preventDefault();
      if (!controlsMenuEl.classList.contains('hidden')) {
        closeControlsMenu();
      } else if (!iconLegendEl.classList.contains('hidden')) {
        closeLegend();
      } else if (inspectMode) {
        exitInspectMode();
      }
      break;
  }
});

/**
 * Tracks an event rate (frames or ticks per second) by counting events into a fixed
 * wall-clock window and reporting the previous window's rate once the current one
 * fills — smoother than an instantaneous per-frame estimate, still cheap to compute.
 */
function createRateMeter(windowMs: number) {
  let windowStart: number | null = null;
  let windowCount = 0;
  let rate = 0;
  return {
    sample(now: number, count: number): number {
      if (windowStart === null) windowStart = now;
      windowCount += count;
      const elapsed = now - windowStart;
      if (elapsed >= windowMs) {
        rate = (windowCount / elapsed) * 1000;
        windowStart = now;
        windowCount = 0;
      }
      return rate;
    },
  };
}

const RATE_WINDOW_MS = 500;
const fpsMeter = createRateMeter(RATE_WINDOW_MS);
const tpsMeter = createRateMeter(RATE_WINDOW_MS);
let lastTickCount = 0;
let fps = 0;
let tps = 0;

function formatPerf(): string {
  return `${Math.round(fps)} FPS · ${Math.round(tps)} TPS`;
}

function currentStatCounts(): StatCounts {
  return computeStatCounts(latestSnapshot?.entities ?? []);
}

// Trends (growing/shrinking, per #37) are diffed against a snapshot of counts taken
// once per second, wall-clock — independent of tick rate and of the RENDER_FPS-throttled
// render loop below, so the sampling cadence doesn't jitter with frame rate or change
// meaning as the user adjusts simulation speed.
let previousStatCounts: StatCounts | null = null;
let totalTrend: Trend | null = null;
let mineralsTrend: Trend | null = null;
let substanceTrends = new Map<Substance, Trend | null>();

function sampleTrends(): void {
  const counts = currentStatCounts();
  if (previousStatCounts) {
    totalTrend = computeTrend(previousStatCounts.total, counts.total);
    mineralsTrend = computeTrend(previousStatCounts.minerals, counts.minerals);
    const substances = new Set([...counts.bySubstance.keys(), ...previousStatCounts.bySubstance.keys()]);
    substanceTrends = new Map(
      [...substances].map((substance) => [
        substance,
        computeTrend(previousStatCounts!.bySubstance.get(substance) ?? 0, counts.bySubstance.get(substance) ?? 0),
      ]),
    );
  }
  previousStatCounts = counts;
}
setInterval(sampleTrends, 1000);

// Births/deaths rates (#40) sample the same once-per-second wall-clock cadence as the
// trend chevrons above, independent of tick rate: a raw per-tick count would be
// meaningless at high speed (many ticks batch between worker snapshots, so a birth and
// a death in the same batch would cancel out invisibly) or tiny/noisy at low speed,
// whereas a real-time rate stays comparable regardless of the current speed setting.
let previousBirthsDeaths: { totalBirths: number; totalDeaths: number } | null = null;
let birthsPerSec = 0;
let deathsPerSec = 0;

function sampleBirthsDeaths(): void {
  if (!latestSnapshot) return;
  const current = { totalBirths: latestSnapshot.totalBirths, totalDeaths: latestSnapshot.totalDeaths };
  if (previousBirthsDeaths) {
    birthsPerSec = current.totalBirths - previousBirthsDeaths.totalBirths;
    deathsPerSec = current.totalDeaths - previousBirthsDeaths.totalDeaths;
  }
  previousBirthsDeaths = current;
}
setInterval(sampleBirthsDeaths, 1000);

/** Builds a tight, overlapping vertical stack of chevrons for a trend, or null to show none. */
function buildTrendEl(trend: Trend | null): HTMLElement | null {
  if (!trend) return null;
  const el = document.createElement('span');
  el.className = `trend trend-${trend.direction}`;
  el.title = `Trending ${trend.direction}`;
  for (let i = 0; i < trend.chevrons; i++) {
    const chevron = document.createElement('span');
    chevron.className = 'chevron';
    chevron.setAttribute('aria-hidden', 'true');
    el.appendChild(chevron);
  }
  return el;
}

function appendStatSegment(target: HTMLElement, text: string, trend: Trend | null): void {
  if (target.childNodes.length > 0) {
    target.appendChild(document.createTextNode(' · '));
  }
  target.appendChild(document.createTextNode(text));
  const trendEl = buildTrendEl(trend);
  if (trendEl) target.appendChild(trendEl);
}

const renderStats = (counts: StatCounts): void => {
  statsEl.replaceChildren();
  appendStatSegment(statsEl, `Tick ${latestSnapshot?.tickCount ?? 0}`, null);
  appendStatSegment(statsEl, `Population ${counts.total}`, totalTrend);
  appendStatSegment(statsEl, `Minerals ${counts.minerals}`, mineralsTrend);
  // Fixed PHYSICAL_SUBSTANCES order (not sorted by count) to match the stats bar's chips
  // and the charts' line order, so a substance sits in the same position everywhere.
  for (const substance of PHYSICAL_SUBSTANCES) {
    appendStatSegment(statsEl, `${substance} ${counts.bySubstance.get(substance) ?? 0}`, substanceTrends.get(substance) ?? null);
  }
};

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

  const header = document.createElement('div');
  header.className = 'matrix-header';
  const label = document.createElement('span');
  label.className = 'matrix-label';
  label.textContent = 'Instructions';
  const legendToggle = document.createElement('button');
  legendToggle.type = 'button';
  legendToggle.className = 'legend-toggle';
  legendToggle.textContent = '?';
  legendToggle.setAttribute('aria-label', 'Show instruction icon legend');
  legendToggle.title = 'Show instruction icon legend (H)';
  legendToggle.addEventListener('click', openLegend);
  header.append(label, legendToggle);
  section.appendChild(header);

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
    cell.appendChild(buildIcon(ACTION_ICON[instruction.action.type], 'matrix-cell-icon'));
    const badgeIcon = modeIconFor(instruction.action);
    if (badgeIcon) {
      const badge = document.createElement('span');
      badge.className = 'matrix-cell-badge';
      badge.appendChild(buildIcon(badgeIcon, ''));
      cell.appendChild(badge);
    }
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
 * Builds the icon legend popup's content: one swatch per action, then the mode badges
 * grouped by which action they belong to. Purely static (doesn't depend on any entity),
 * so it's built once at startup rather than on every render like the matrix itself.
 */
function buildLegendContent(): HTMLElement {
  const root = document.createDocumentFragment();

  const actions = document.createElement('div');
  actions.className = 'legend-actions';
  for (const type of Object.keys(ACTION_COLORS) as Action['type'][]) {
    const card = document.createElement('div');
    card.className = 'legend-action';
    const swatch = document.createElement('div');
    swatch.className = 'legend-action-swatch';
    swatch.style.backgroundColor = ACTION_COLORS[type];
    swatch.appendChild(buildIcon(ACTION_ICON[type], ''));
    swatch.title = ACTION_DESCRIPTIONS[type];
    const name = document.createElement('span');
    name.className = 'legend-action-name';
    name.textContent = type;
    card.append(swatch, name);
    actions.appendChild(card);
  }

  const groups = document.createElement('div');
  groups.className = 'legend-groups';

  const buildGroup = (title: string, dotColor: string, rows: { icon: string; name: string; desc: string }[]): HTMLElement => {
    const group = document.createElement('div');
    const groupTitle = document.createElement('div');
    groupTitle.className = 'legend-group-title';
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.backgroundColor = dotColor;
    groupTitle.append(dot, document.createTextNode(title));
    group.appendChild(groupTitle);

    for (const row of rows) {
      const rowEl = document.createElement('div');
      rowEl.className = 'legend-row';
      const badge = document.createElement('div');
      badge.className = 'legend-badge';
      badge.appendChild(buildIcon(row.icon, ''));
      const copy = document.createElement('div');
      copy.className = 'legend-copy';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = row.name;
      const desc = document.createElement('span');
      desc.className = 'desc';
      desc.textContent = row.desc;
      copy.append(name, desc);
      rowEl.append(badge, copy);
      group.appendChild(rowEl);
    }
    return group;
  };

  groups.appendChild(
    buildGroup(
      'Move modes',
      ACTION_COLORS.Move,
      (Object.keys(MOVE_MODE_ICON) as MoveMode[]).map((mode) => ({
        icon: MOVE_MODE_ICON[mode],
        name: mode,
        desc: MOVE_MODE_DESCRIPTIONS[mode],
      })),
    ),
  );
  groups.appendChild(
    buildGroup(
      'Produce modes',
      ACTION_COLORS.Produce,
      (Object.keys(PRODUCE_MODE_ICON) as ProduceMode[]).map((mode) => ({
        icon: PRODUCE_MODE_ICON[mode],
        name: mode,
        desc: PRODUCE_MODE_DESCRIPTIONS[mode],
      })),
    ),
  );

  root.append(actions, groups);
  const wrapper = document.createElement('div');
  wrapper.appendChild(root);
  return wrapper;
}

/**
 * Fingerprint of the last rendered inspector content, so `renderInspector` (called
 * every animation frame) only touches the DOM when something actually changed.
 * Without this, per-frame `replaceChildren` churn can swap a matrix-cell button out
 * from under a real click between its mousedown and mouseup.
 */
let lastRenderSignature: string | null = null;

const renderInspector = (): void => {
  if (!inspectMode || !inspectedTarget) {
    inspectorEl.classList.add('hidden');
    lastRenderSignature = null;
    return;
  }

  // Entity targets (organics) are resolved by id every frame so the inspector keeps
  // following the same creature as it moves; a gone id (the organic died) is shown
  // distinctly from "Empty" rather than falling through to whatever now occupies its
  // old cell. Cell targets (minerals, empty taps) stay position-based, since minerals
  // never move and have no stable id to track by.
  const entity: Entity | null =
    inspectedTarget.type === 'entity'
      ? (organicById.get(inspectedTarget.id) ?? null)
      : (entityByPosition.get(`${inspectedTarget.position.x},${inspectedTarget.position.y}`) ?? null);
  const gone = inspectedTarget.type === 'entity' && !entity;

  const rows: InspectorRow[] = [];
  if (entity) {
    rows.push({ label: 'Cell', value: `${entity.position.x}, ${entity.position.y}` });
  } else if (inspectedTarget.type === 'cell') {
    rows.push({ label: 'Cell', value: `${inspectedTarget.position.x}, ${inspectedTarget.position.y}` });
  }

  if (gone) {
    rows.push({ label: 'Status', value: 'Gone' });
  } else if (!entity) {
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

// Drawing and DOM updates only happen at most RENDER_FPS times/sec — this simulation's
// visuals don't need a full display refresh rate, and skipping the work (not just the
// display of it) saves real CPU. requestAnimationFrame still reschedules every native
// frame regardless, since that's the only way to keep sampling wall-clock time for the
// throttle check.
const FRAME_INTERVAL_MS = 1000 / RENDER_FPS;
let lastRenderTime: number | null = null;

const frame = (time: number): void => {
  if (lastRenderTime !== null && time - lastRenderTime < FRAME_INTERVAL_MS) {
    requestAnimationFrame(frame);
    return;
  }
  lastRenderTime = time;

  fps = fpsMeter.sample(time, 1);
  const counts = currentStatCounts();
  if (latestSnapshot) {
    tps = tpsMeter.sample(time, latestSnapshot.tickCount - lastTickCount);
    lastTickCount = latestSnapshot.tickCount;
    renderer.draw(latestSnapshot);
    const averages = engineSettings
      ? computeAverageRatios(latestSnapshot.entities, engineSettings.maxAge, engineSettings.maxSize)
      : ZERO_AVERAGE_RATIOS;
    statsDrawer.update(counts, averages, { births: birthsPerSec, deaths: deathsPerSec }, latestSnapshot.tickCount);
  }
  renderStats(counts);
  perfEl.textContent = formatPerf();
  renderInspector();
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
