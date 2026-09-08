import { Entity, GridView, Position, Substance, substanceOf } from '../engine/types';
import {
  categoricalValueOf,
  continuousFieldMax,
  continuousValueOf,
  HighlightNormalization,
  HighlightState,
  isCategoricalHighlightField,
} from './highlight';

export const SUBSTANCE_COLORS: Record<Substance, string> = {
  Sun: '#f97316',
  Blue: '#3b82f6',
  Green: '#22c55e',
  Yellow: '#eab308',
  White: '#e5e7eb',
  Red: '#ef4444',
};

const BACKGROUND_COLOR = '#0b1120';
const ORGANIC_OUTLINE = 'rgba(255, 255, 255, 0.85)';
/** Outline for a highlight-matching entity — distinct from the default organic outline so a match still pops when it's a mineral (which otherwise never strokes). */
const HIGHLIGHT_MATCH_OUTLINE = '#facc15';
/** Flat fill for an entity the active highlight condition excludes or doesn't match — the "gray-out" half of #78. */
const HIGHLIGHT_DIM_COLOR = 'rgba(100, 116, 139, 0.35)';

/** An active highlight condition plus the ceilings its heatmap fields normalize against. */
export interface ActiveHighlight extends HighlightState, HighlightNormalization {}

/** Interpolates a heatmap color for t in [0,1]: cool blue at 0, through amber, to hot red at 1. */
function heatmapColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const hue = 220 - clamped * 220;
  return `hsl(${hue}, 85%, 55%)`;
}

/** Renders a Grid's occupants onto a Canvas2D context, one rect per cell. */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context is not available');
    this.ctx = ctx;
  }

  /** Sizes the backing pixel buffer for the device pixel ratio, given CSS-pixel dimensions. */
  resize(cssWidth: number, cssHeight: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private layout(grid: GridView): { cellSize: number; offsetX: number; offsetY: number; cssWidth: number; cssHeight: number } {
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = this.canvas.width / dpr;
    const cssHeight = this.canvas.height / dpr;
    const cellSize = Math.max(1, Math.min(cssWidth / grid.width, cssHeight / grid.height));
    const offsetX = (cssWidth - cellSize * grid.width) / 2;
    const offsetY = (cssHeight - cellSize * grid.height) / 2;
    return { cellSize, offsetX, offsetY, cssWidth, cssHeight };
  }

  draw(grid: GridView, highlight?: ActiveHighlight | null): void {
    const { cellSize, offsetX, offsetY, cssWidth, cssHeight } = this.layout(grid);

    this.ctx.fillStyle = BACKGROUND_COLOR;
    this.ctx.fillRect(0, 0, cssWidth, cssHeight);

    const active = highlight?.enabled ? highlight : null;

    for (const entity of grid.entities) {
      const px = offsetX + entity.position.x * cellSize;
      const py = offsetY + entity.position.y * cellSize;
      const { color, outline } = active ? this.resolveHighlightStyle(entity, active) : { color: SUBSTANCE_COLORS[substanceOf(entity)], outline: null };

      if (entity.kind === 'mineral') {
        this.ctx.globalAlpha = 0.5;
        this.ctx.fillStyle = color;
        this.ctx.fillRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
        this.ctx.globalAlpha = 1;
        if (outline) {
          this.ctx.strokeStyle = outline;
          this.ctx.lineWidth = Math.max(1, cellSize * 0.08);
          this.ctx.strokeRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
        }
      } else {
        const pad = cellSize * 0.1;
        this.ctx.fillStyle = color;
        this.ctx.fillRect(px + pad, py + pad, cellSize - pad * 2, cellSize - pad * 2);
        this.ctx.strokeStyle = outline ?? ORGANIC_OUTLINE;
        this.ctx.lineWidth = Math.max(1, cellSize * 0.08);
        this.ctx.strokeRect(px + pad, py + pad, cellSize - pad * 2, cellSize - pad * 2);
      }
    }
  }

  /**
   * One extra branch alongside the flat substance-color lookup (per #78's implementation
   * note: fold into the existing single pass rather than a second one). Categorical fields
   * gray out everything but the matching value; continuous fields recolor the whole grid on
   * a fixed gradient. An entity the field has no meaning for (e.g. a mineral under `age`)
   * renders as excluded, same as a categorical non-match.
   */
  private resolveHighlightStyle(entity: Entity, highlight: ActiveHighlight): { color: string; outline: string | null } {
    if (isCategoricalHighlightField(highlight.field)) {
      const value = categoricalValueOf(entity, highlight.field);
      if (value !== null && value === highlight.selectedValue) {
        return { color: SUBSTANCE_COLORS[value], outline: HIGHLIGHT_MATCH_OUTLINE };
      }
      return { color: HIGHLIGHT_DIM_COLOR, outline: null };
    }

    const value = continuousValueOf(entity, highlight.field);
    if (value === null) return { color: HIGHLIGHT_DIM_COLOR, outline: null };
    const max = continuousFieldMax(highlight.field, highlight);
    return { color: heatmapColor(max > 0 ? value / max : 0), outline: null };
  }

  /** Maps a client-space point (e.g. from a pointer event) to a grid cell, or null if outside the grid. */
  cellFromClientPoint(clientX: number, clientY: number, grid: GridView): Position | null {
    const rect = this.canvas.getBoundingClientRect();
    const cellSize = Math.max(1, Math.min(rect.width / grid.width, rect.height / grid.height));
    const offsetX = (rect.width - cellSize * grid.width) / 2;
    const offsetY = (rect.height - cellSize * grid.height) / 2;
    const x = Math.floor((clientX - rect.left - offsetX) / cellSize);
    const y = Math.floor((clientY - rect.top - offsetY) / cellSize);
    const inBounds = x >= 0 && y >= 0 && x < grid.width && y < grid.height;
    return inBounds ? { x, y } : null;
  }
}
