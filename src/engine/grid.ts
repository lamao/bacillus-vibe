import { Entity, Mineral, Organic, Position, chebyshevDistance } from './types';

export class Grid {
  readonly width: number;
  readonly height: number;
  private readonly cells: (Entity | null)[];

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

  get(x: number, y: number): Entity | null {
    if (!this.inBounds(x, y)) return null;
    return this.cells[this.index(x, y)];
  }

  set(x: number, y: number, entity: Entity | null): void {
    if (!this.inBounds(x, y)) return;
    this.cells[this.index(x, y)] = entity;
  }

  clear(x: number, y: number): void {
    this.set(x, y, null);
  }

  isFree(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.get(x, y) === null;
  }

  /** Moves whatever entity is at `from` to `to`, updating its `position`. Assumes `to` is free. */
  moveEntity(entity: Organic | Mineral, to: Position): void {
    this.clear(entity.position.x, entity.position.y);
    entity.position = to;
    this.set(to.x, to.y, entity);
  }

  entities(): Entity[] {
    const result: Entity[] = [];
    for (const c of this.cells) if (c) result.push(c);
    return result;
  }

  organics(): Organic[] {
    const result: Organic[] = [];
    for (const c of this.cells) if (c && c.kind === 'organic') result.push(c);
    return result;
  }

  minerals(): Mineral[] {
    const result: Mineral[] = [];
    for (const c of this.cells) if (c && c.kind === 'mineral') result.push(c);
    return result;
  }

  /** All in-bounds cell positions within Chebyshev `radius` of (x,y), excluding the center, nearest first. */
  positionsInRange(x: number, y: number, radius: number): Position[] {
    const result: Position[] = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (this.inBounds(nx, ny)) result.push({ x: nx, y: ny });
      }
    }
    const center = { x, y };
    result.sort((a, b) => chebyshevDistance(center, a) - chebyshevDistance(center, b));
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
