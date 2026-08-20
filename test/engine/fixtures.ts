import { Grid } from '../../src/engine/grid';
import { defaultSettings, Settings } from '../../src/engine/settings';
import { DNA, Mineral, Organic, Position, Substance } from '../../src/engine/types';

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

export function dna(overrides: Partial<DNA> = {}): DNA {
  return {
    body: 'Blue',
    consume: 'Green',
    produce: 'Yellow',
    toxin: 'Red',
    canMove: true,
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
