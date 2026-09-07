import { Entity, Mineral, Organic, Position, chebyshevDistance } from './types';

/**
 * Sorted (nearest-first), zero-centered offset lists for a given Chebyshev radius, memoized
 * across all `Grid` instances since they depend only on `radius`, never on grid dimensions or
 * query center. Avoids re-sorting on every `positionsInRange` call even though the engine only
 * ever queries a handful of distinct radii (from `Settings`).
 */
const offsetCache = new Map<number, readonly Position[]>();

function offsetsForRadius(radius: number): readonly Position[] {
  let offsets = offsetCache.get(radius);
  if (!offsets) {
    const origin: Position = { x: 0, y: 0 };
    const built: Position[] = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        built.push({ x: dx, y: dy });
      }
    }
    built.sort((a, b) => chebyshevDistance(origin, a) - chebyshevDistance(origin, b));
    offsets = built;
    offsetCache.set(radius, offsets);
  }
  return offsets;
}

export class Grid {
  readonly width: number;
  readonly height: number;
  private readonly cells: (Entity | null)[];
  /**
   * Live, incrementally-maintained membership per kind, kept in sync by `set`/`clear` so
   * `entities`/`organics`/`minerals` never need to rescan the whole `width*height` `cells`
   * array — only touch (and allocate an array of) the entities that actually exist. Iteration
   * order is each entity's registration order (when it was first `set` onto the grid), stable
   * for its whole lifetime: `moveEntity` updates `cells` directly without re-registering, so
   * relocating doesn't reorder it.
   */
  private readonly organicSet = new Set<Organic>();
  private readonly mineralSet = new Set<Mineral>();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cells = new Array(width * height).fill(null);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  private index(x: number, y: number): number {
    return y * this.width + x;
  }

  private registerEntity(entity: Entity): void {
    if (entity.kind === 'organic') this.organicSet.add(entity);
    else this.mineralSet.add(entity);
  }

  private unregisterEntity(entity: Entity): void {
    if (entity.kind === 'organic') this.organicSet.delete(entity);
    else this.mineralSet.delete(entity);
  }

  get(x: number, y: number): Entity | null {
    if (!this.inBounds(x, y)) return null;
    return this.cells[this.index(x, y)];
  }

  set(x: number, y: number, entity: Entity | null): void {
    if (!this.inBounds(x, y)) return;
    const i = this.index(x, y);
    const previous = this.cells[i];
    if (previous === entity) return;
    if (previous) this.unregisterEntity(previous);
    this.cells[i] = entity;
    if (entity) this.registerEntity(entity);
  }

  clear(x: number, y: number): void {
    this.set(x, y, null);
  }

  isFree(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.get(x, y) === null;
  }

  /** Moves whatever entity is at `from` to `to`, updating its `position`. Assumes `to` is free. */
  moveEntity(entity: Organic | Mineral, to: Position): void {
    // Bypasses `set`/`clear`'s kind-set bookkeeping: the entity's identity and kind don't
    // change on a move, so it stays registered at its original position in `organicSet`/
    // `mineralSet` — only the flat `cells` backing array needs updating.
    if (this.inBounds(entity.position.x, entity.position.y)) this.cells[this.index(entity.position.x, entity.position.y)] = null;
    entity.position = to;
    if (this.inBounds(to.x, to.y)) this.cells[this.index(to.x, to.y)] = entity;
  }

  entities(): Entity[] {
    return [...this.organicSet, ...this.mineralSet];
  }

  organics(): Organic[] {
    return [...this.organicSet];
  }

  minerals(): Mineral[] {
    return [...this.mineralSet];
  }

  /** All in-bounds cell positions within Chebyshev `radius` of (x,y), excluding the center, nearest first. */
  positionsInRange(x: number, y: number, radius: number): Position[] {
    const result: Position[] = [];
    for (const offset of offsetsForRadius(radius)) {
      const nx = x + offset.x;
      const ny = y + offset.y;
      if (this.inBounds(nx, ny)) result.push({ x: nx, y: ny });
    }
    return result;
  }

  /** Entities within Chebyshev `radius` of `pos`, nearest first. */
  entitiesInRange(pos: Position, radius: number): Entity[] {
    const result: Entity[] = [];
    for (const p of this.positionsInRange(pos.x, pos.y, radius)) {
      const e = this.get(p.x, p.y);
      if (e) result.push(e);
    }
    return result;
  }
}
