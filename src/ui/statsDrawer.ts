import { PHYSICAL_SUBSTANCES } from '../engine/types';
import { scaleLinePoints } from './chart';
import { SUBSTANCE_COLORS } from './renderer';
import { StatCounts } from './stats';
import { StatsHistory, TIME_WINDOWS, TimeWindow } from './statsHistory';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CHEVRON_UP = '<polyline points="6 15 12 9 18 15"></polyline>';
const CHEVRON_DOWN = '<polyline points="6 9 12 15 18 9"></polyline>';
const ARROW_LEFT = '<polyline points="15 4 7 12 15 20"></polyline>';
const ARROW_RIGHT = '<polyline points="9 4 17 12 9 20"></polyline>';

function svgIcon(inner: string, size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

function requireEl<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Petri: expected stats drawer element ${selector} was not found`);
  return el;
}

const CHART_WIDTH = 1300;
const CHART_HEIGHT = 190;
const CHART_MARGIN = 12;
const GRIDLINE_COUNT = 4;
const TOTAL_LINE_COLOR = '#e6e9f2';

/**
 * Titles of the drawer's paged-carousel tabs, in display order. Only "Population" (#38)
 * is implemented so far; later issues (Averages, Births & deaths, Composition) extend
 * this array and add a matching branch in `renderChart` — no shell changes needed.
 */
const PAGE_TITLES = ['Population'] as const;

/**
 * The docked-bottom stats widget (#38): a collapsed bar (total + per-substance chips)
 * that expands into a paged-carousel drawer with a time-windowed line chart. Wires its
 * own DOM (queried by id from index.html) and exposes `update`, called once per
 * animation frame with the latest counts, to keep the bar/chart in sync.
 */
export class StatsDrawer {
  private readonly history = new StatsHistory();
  private expanded = false;
  private pageIndex = 0;
  private selectedWindow: TimeWindow = 2000;
  private lastChartSignature: string | null = null;

  private readonly root = requireEl<HTMLElement>('#stats-drawer');
  private readonly bar = requireEl<HTMLButtonElement>('#stats-bar');
  private readonly chevron = requireEl<HTMLElement>('#stats-chevron');
  private readonly totalValueEl = requireEl<HTMLElement>('#stats-total-value');
  private readonly chipRowEl = requireEl<HTMLElement>('#stats-chip-row');
  private readonly body = requireEl<HTMLElement>('#stats-drawer-body');
  private readonly prevBtn = requireEl<HTMLButtonElement>('#stats-prev');
  private readonly nextBtn = requireEl<HTMLButtonElement>('#stats-next');
  private readonly pageTitleEl = requireEl<HTMLElement>('#stats-page-title');
  private readonly dotsEl = requireEl<HTMLElement>('#stats-pager-dots');
  private readonly chipsEl = requireEl<HTMLElement>('#stats-chips');
  private readonly chartEl = requireEl<SVGSVGElement>('#stats-chart');

  constructor() {
    this.chevron.innerHTML = svgIcon(CHEVRON_UP, 16);
    this.prevBtn.innerHTML = svgIcon(ARROW_LEFT, 18);
    this.nextBtn.innerHTML = svgIcon(ARROW_RIGHT, 18);
    this.chartEl.setAttribute('viewBox', `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`);
    // The chart's CSS box (esp. on mobile) is nowhere near this viewBox's aspect ratio;
    // without "none" the default xMidYMid-meet scaling would preserve that ratio and
    // letterbox the chart, leaving a large empty band above/below the plotted lines.
    this.chartEl.setAttribute('preserveAspectRatio', 'none');

    this.buildDots();
    this.buildWindowChips();
    this.updatePagerState();

    this.bar.addEventListener('click', () => this.setExpanded(!this.expanded));
    this.prevBtn.addEventListener('click', () => this.changePage(-1));
    this.nextBtn.addEventListener('click', () => this.changePage(1));

    // Published as a CSS variable (rather than a hardcoded collapsed-bar height) so the
    // inspector panel — an independent overlay anchored to canvas-wrap's top — can keep
    // its max-height clear of however tall this drawer currently is, collapsed or
    // expanded, without the two components needing to know about each other's layout.
    new ResizeObserver(() => this.publishHeight()).observe(this.root);
    this.publishHeight();
  }

  private publishHeight(): void {
    document.documentElement.style.setProperty('--stats-drawer-height', `${this.root.getBoundingClientRect().height}px`);
  }

  /** Called once per animation frame with the latest population counts and tick. */
  update(counts: StatCounts, tick: number): void {
    this.history.record(tick, counts.total, counts.bySubstance);
    this.renderBar(counts);
    if (this.expanded) this.renderChart(counts);
  }

  private setExpanded(value: boolean): void {
    this.expanded = value;
    this.root.classList.toggle('expanded', value);
    this.body.classList.toggle('hidden', !value);
    this.bar.setAttribute('aria-expanded', String(value));
    this.chevron.innerHTML = svgIcon(value ? CHEVRON_DOWN : CHEVRON_UP, 16);
    if (value) this.lastChartSignature = null;
  }

  private buildDots(): void {
    this.dotsEl.replaceChildren();
    this.dotsEl.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < PAGE_TITLES.length; i++) {
      const dot = document.createElement('span');
      dot.className = 'stats-dot';
      this.dotsEl.appendChild(dot);
    }
  }

  private buildWindowChips(): void {
    this.chipsEl.replaceChildren();
    for (const timeWindow of TIME_WINDOWS) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'stats-chip';
      chip.textContent = `Last ${timeWindow.toLocaleString()}`;
      chip.classList.toggle('active', timeWindow === this.selectedWindow);
      chip.addEventListener('click', () => {
        if (this.selectedWindow === timeWindow) return;
        this.selectedWindow = timeWindow;
        for (const el of this.chipsEl.children) el.classList.toggle('active', el === chip);
        this.lastChartSignature = null;
      });
      this.chipsEl.appendChild(chip);
    }
  }

  private changePage(delta: number): void {
    if (PAGE_TITLES.length <= 1) return;
    this.pageIndex = (this.pageIndex + delta + PAGE_TITLES.length) % PAGE_TITLES.length;
    this.updatePagerState();
    this.lastChartSignature = null;
  }

  private updatePagerState(): void {
    this.pageTitleEl.textContent = PAGE_TITLES[this.pageIndex];
    const dots = this.dotsEl.children;
    for (let i = 0; i < dots.length; i++) {
      dots[i].classList.toggle('active', i === this.pageIndex);
    }
    const multiPage = PAGE_TITLES.length > 1;
    this.prevBtn.disabled = !multiPage;
    this.nextBtn.disabled = !multiPage;
  }

  private renderBar(counts: StatCounts): void {
    this.totalValueEl.textContent = counts.total.toString();
    this.chipRowEl.replaceChildren();
    for (const substance of PHYSICAL_SUBSTANCES) {
      const count = counts.bySubstance.get(substance);
      if (!count) continue;
      const chip = document.createElement('span');
      chip.className = 'stats-chip-item';
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.backgroundColor = SUBSTANCE_COLORS[substance];
      chip.append(swatch, document.createTextNode(count.toString()));
      this.chipRowEl.appendChild(chip);
    }
  }

  /** Renders the active page's chart, skipped when nothing that would change its output has changed. */
  private renderChart(counts: StatCounts): void {
    const samples = this.history.window(this.selectedWindow);
    const presentSubstances = PHYSICAL_SUBSTANCES.filter((substance) => (counts.bySubstance.get(substance) ?? 0) > 0);
    const latestTick = samples[samples.length - 1]?.tick ?? -1;
    const signature = `${this.pageIndex}|${this.selectedWindow}|${samples.length}|${latestTick}|${presentSubstances.join(',')}`;
    if (signature === this.lastChartSignature) return;
    this.lastChartSignature = signature;

    this.chartEl.replaceChildren();

    for (let i = 0; i < GRIDLINE_COUNT; i++) {
      const y = CHART_MARGIN + (i / (GRIDLINE_COUNT - 1)) * (CHART_HEIGHT - 2 * CHART_MARGIN);
      this.chartEl.appendChild(this.gridline(y));
    }

    const maxTotal = samples.reduce((max, sample) => Math.max(max, sample.total), 0);

    this.chartEl.appendChild(
      this.polyline(
        scaleLinePoints(
          samples.map((s) => s.total),
          CHART_WIDTH,
          CHART_HEIGHT,
          CHART_MARGIN,
          maxTotal,
        ),
        TOTAL_LINE_COLOR,
        2.5,
      ),
    );
    for (const substance of presentSubstances) {
      const values = samples.map((s) => s.bySubstance.get(substance) ?? 0);
      this.chartEl.appendChild(
        this.polyline(scaleLinePoints(values, CHART_WIDTH, CHART_HEIGHT, CHART_MARGIN, maxTotal), SUBSTANCE_COLORS[substance], 1.75),
      );
    }
  }

  private gridline(y: number): SVGLineElement {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('x2', String(CHART_WIDTH));
    line.setAttribute('y1', y.toFixed(1));
    line.setAttribute('y2', y.toFixed(1));
    line.setAttribute('stroke', '#263149');
    line.setAttribute('stroke-width', '1');
    return line;
  }

  private polyline(points: string, color: string, width: number): SVGPolylineElement {
    const el = document.createElementNS(SVG_NS, 'polyline');
    el.setAttribute('points', points);
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', color);
    el.setAttribute('stroke-width', String(width));
    return el;
  }
}
