export type Substance = 'Sun' | 'Blue' | 'Green' | 'Yellow' | 'White' | 'Red';

/** Substances that can exist as physical body matter, food, waste, or toxin. */
export const PHYSICAL_SUBSTANCES: readonly Substance[] = ['Blue', 'Green', 'Yellow', 'White', 'Red'];

export const ALL_SUBSTANCES: readonly Substance[] = ['Sun', ...PHYSICAL_SUBSTANCES];

export interface Position {
  readonly x: number;
  readonly y: number;
}

export interface DNA {
  /** What this organic is made of; becomes its corpse's mineral substance. Never Sun. */
  body: Substance;
  /** What this organic eats. May be Sun. */
  consume: Substance;
  /** What this organic's metabolic waste turns into. Never Sun. */
  produce: Substance;
  /** Which substance damages this organic. Never Sun. */
  toxin: Substance;
  /** Whether this organic actively moves/hunts, or passively digests nearby matter. */
  canMove: boolean;
}

export interface Mineral {
  kind: 'mineral';
  position: Position;
  size: number;
  substance: Substance;
}

export interface Organic {
  kind: 'organic';
  id: number;
  position: Position;
  /** Also this organic's max energy capacity. */
  size: number;
  /** Current energy, always <= size. */
  energy: number;
  /** Chosen direction for this tick's move phase; null means "stay put". */
  direction: Position | null;
  age: number;
  accumulatedWaste: number;
  dna: DNA;
}

export type Entity = Mineral | Organic;

export function substanceOf(entity: Entity): Substance {
  return entity.kind === 'mineral' ? entity.substance : entity.dna.body;
}

export function chebyshevDistance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
