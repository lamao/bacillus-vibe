import { Grid } from '../../src/engine/grid';
import { defaultSettings, Settings } from '../../src/engine/settings';
import { DNA, INSTRUCTION_MATRIX_SIZE, InstructionMatrix, Mineral, Organic, Position, Substance } from '../../src/engine/types';

let idSeq = 0;
export function resetIds(): void {
  idSeq = 0;
}
export function nextTestId(): number {
  return idSeq++;
}

export function testSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...defaultSettings(10, 10), ...overrides };
}

/**
 * A 25-entry matrix that always Rests (its `Random >= 2` test can never pass,
 * so it just cycles through identical Rest states). Used as the default test
 * DNA behavior so phase tests that don't target `decideAction` aren't affected
 * by action-gated movement/digestion; tests that need real behavior override it.
 */
export function restBehavior(): InstructionMatrix {
  return Array.from({ length: INSTRUCTION_MATRIX_SIZE }, () => ({
    action: { type: 'Rest' as const },
    sensor: 'Random' as const,
    comparator: '>=' as const,
    threshold: 2,
    jumpOffset: 0,
  }));
}

export function dna(overrides: Partial<DNA> = {}): DNA {
  return {
    body: 'Blue',
    consume: 'Green',
    produce: 'Yellow',
    toxin: 'Red',
    behavior: restBehavior(),
    ...overrides,
  };
}

export function organic(position: Position, overrides: Partial<Organic> = {}): Organic {
  return {
    kind: 'organic',
    id: nextTestId(),
    position,
    size: 750,
    energy: 500,
    direction: null,
    age: 0,
    accumulatedWaste: 0,
    dna: dna(),
    currentState: 0,
    chosenAction: null,
    ...overrides,
  };
}

export function mineral(position: Position, substance: Substance, size: number, overrides: Partial<Mineral> = {}): Mineral {
  return { kind: 'mineral', position, size, substance, ...overrides };
}

export function place(grid: Grid, ...entities: (Organic | Mineral)[]): void {
  for (const e of entities) grid.set(e.position.x, e.position.y, e);
}

export function emptyGrid(settings: Settings): Grid {
  return new Grid(settings.width, settings.height);
}
