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
  /**
   * Index into the instruction matrix ring (see below) this organic is
   * currently in. Stubbed at 0 for every organic until the interpreter
   * (#6) actually advances it; exists so the inspector (#8) has something
   * to show.
   */
  currentState: number;
}

export type Entity = Mineral | Organic;

export function substanceOf(entity: Entity): Substance {
  return entity.kind === 'mineral' ? entity.substance : entity.dna.body;
}

export function chebyshevDistance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Draft, not yet wired into the tick pipeline — see #6/#5.
 * `DNA` does not carry a `behavior: InstructionMatrix` field yet.
 */

export type MoveMode = 'TowardConsume' | 'AwayFromToxin' | 'TowardOpenSpace' | 'Random' | 'Hold';
export type ProduceMode = 'Release' | 'Hold';
export type SplitMode = 'Attempt';

export type Action =
  | { type: 'Move'; mode: MoveMode }
  | { type: 'Produce'; mode: ProduceMode }
  | { type: 'Split'; mode: SplitMode }
  | { type: 'Rest' };

export type Sensor = 'FoodDist' | 'ToxinDist' | 'EnergyRatio' | 'SizeRatio' | 'Age' | 'Crowding' | 'Random';

export type Comparator = '<' | '>=';

/** One state in an organic's instruction matrix: an action to take, and a test deciding the next state. */
export interface Instruction {
  action: Action;
  sensor: Sensor;
  comparator: Comparator;
  threshold: number;
  jumpOffset: number;
}

/** A fixed 25-entry (5x5) circular ring of states; index arithmetic wraps modulo this size. */
export const INSTRUCTION_MATRIX_SIZE = 25;

export type InstructionMatrix = readonly Instruction[];

/**
 * Wraps `index + offset` into `[0, INSTRUCTION_MATRIX_SIZE)`, matching the instruction
 * matrix's circular-ring rule in both directions (positive or negative offset).
 */
export function wrapMatrixIndex(index: number, offset: number): number {
  return ((index + offset) % INSTRUCTION_MATRIX_SIZE + INSTRUCTION_MATRIX_SIZE) % INSTRUCTION_MATRIX_SIZE;
}
