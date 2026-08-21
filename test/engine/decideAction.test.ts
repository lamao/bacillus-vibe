import { describe, expect, it } from 'vitest';
import { decideAction } from '../../src/engine/phases';
import { Instruction } from '../../src/engine/types';
import { dna, emptyGrid, mineral, organic, place, testSettings } from './fixtures';
import { MockRNG } from './mockRng';

/** Builds a one-instruction behavior matrix for tests that only ever read state 0. */
function behaviorOf(instruction: Instruction): Instruction[] {
  return [instruction];
}

describe('decideAction (phase 1)', () => {
  it("stamps chosenAction from the current state's action and advances currentState by 1 when the test fails", () => {
    const settings = testSettings();
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Move', mode: 'Hold' },
      sensor: 'Random',
      comparator: '>=',
      threshold: 2, // unreachable: Random is in [0, 1)
      jumpOffset: 5,
    };
    const o = organic({ x: 5, y: 5 }, { dna: dna({ behavior: behaviorOf(instruction) }), currentState: 0 });
    place(grid, o);
    decideAction(grid, settings, new MockRNG([0.5]));
    expect(o.chosenAction).toEqual({ type: 'Move', mode: 'Hold' });
    expect(o.currentState).toBe(1);
  });

  it('advances currentState by jumpOffset, wrapped modulo the ring size, when the test passes', () => {
    const settings = testSettings();
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Rest' },
      sensor: 'Random',
      comparator: '>=',
      threshold: 0, // always true: Random is always >= 0
      jumpOffset: 30, // wraps to (0 + 30) % 25 = 5
    };
    const o = organic({ x: 5, y: 5 }, { dna: dna({ behavior: behaviorOf(instruction) }), currentState: 0 });
    place(grid, o);
    decideAction(grid, settings, new MockRNG([0.3]));
    expect(o.currentState).toBe(5);
  });

  it('reads FoodDist as visionRange when no matching entity is in range', () => {
    const settings = testSettings({ visionRange: 3 });
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Rest' },
      sensor: 'FoodDist',
      comparator: '>=',
      threshold: 3, // passes only when nothing was found (reads as visionRange)
      jumpOffset: 10,
    };
    const o = organic({ x: 5, y: 5 }, { dna: dna({ consume: 'Green', behavior: behaviorOf(instruction) }) });
    place(grid, o);
    decideAction(grid, settings, new MockRNG([0]));
    expect(o.currentState).toBe(10);
  });

  it('reads FoodDist as the Chebyshev distance to the nearest matching entity in range', () => {
    const settings = testSettings({ visionRange: 3 });
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Rest' },
      sensor: 'FoodDist',
      comparator: '<',
      threshold: 2, // passes when food is closer than 2
      jumpOffset: 8,
    };
    const o = organic({ x: 5, y: 5 }, { dna: dna({ consume: 'Green', behavior: behaviorOf(instruction) }) });
    const food = mineral({ x: 6, y: 5 }, 'Green', 100); // distance 1
    place(grid, o, food);
    decideAction(grid, settings, new MockRNG([0]));
    expect(o.currentState).toBe(8);
  });

  it('reads Random as a fresh rng draw each evaluation', () => {
    const settings = testSettings();
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Rest' },
      sensor: 'Random',
      comparator: '<',
      threshold: 0.5,
      jumpOffset: 9,
    };
    const passing = organic({ x: 0, y: 0 }, { dna: dna({ behavior: behaviorOf(instruction) }) });
    const failing = organic({ x: 5, y: 5 }, { dna: dna({ behavior: behaviorOf(instruction) }) });
    place(grid, passing, failing);
    // grid.organics() walks cells in index order, so (0,0) is evaluated before (5,5),
    // consuming rng values in that order: 0.3 (< 0.5, passes) then 0.7 (>= 0.5, fails).
    decideAction(grid, settings, new MockRNG([0.3, 0.7]));
    expect(passing.currentState).toBe(9);
    expect(failing.currentState).toBe(1);
  });

  it('reads ToxinDist as toxinRange when no matching entity is in range', () => {
    const settings = testSettings({ toxinRange: 3 });
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Rest' },
      sensor: 'ToxinDist',
      comparator: '>=',
      threshold: 3, // passes only when nothing was found (reads as toxinRange)
      jumpOffset: 12,
    };
    const o = organic({ x: 5, y: 5 }, { dna: dna({ toxin: 'Red', behavior: behaviorOf(instruction) }) });
    place(grid, o);
    decideAction(grid, settings, new MockRNG([0]));
    expect(o.currentState).toBe(12);
  });

  it('reads ToxinDist as the Chebyshev distance to the nearest matching entity in range', () => {
    const settings = testSettings({ toxinRange: 3 });
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Rest' },
      sensor: 'ToxinDist',
      comparator: '<',
      threshold: 2, // passes when toxin is closer than 2
      jumpOffset: 8,
    };
    const o = organic({ x: 5, y: 5 }, { dna: dna({ toxin: 'Red', behavior: behaviorOf(instruction) }) });
    const toxin = mineral({ x: 6, y: 5 }, 'Red', 100); // distance 1
    place(grid, o, toxin);
    decideAction(grid, settings, new MockRNG([0]));
    expect(o.currentState).toBe(8);
  });

  it('reads EnergyRatio as energy divided by size', () => {
    const settings = testSettings();
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Rest' },
      sensor: 'EnergyRatio',
      comparator: '>=',
      threshold: 0.5,
      jumpOffset: 6,
    };
    const o = organic({ x: 5, y: 5 }, { dna: dna({ behavior: behaviorOf(instruction) }), energy: 600, size: 800 });
    place(grid, o);
    decideAction(grid, settings, new MockRNG([0]));
    expect(o.currentState).toBe(6); // 600/800 = 0.75 >= 0.5
  });

  it('reads SizeRatio as size divided by MaxSize', () => {
    const settings = testSettings({ maxSize: 1000 });
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Rest' },
      sensor: 'SizeRatio',
      comparator: '<',
      threshold: 0.5,
      jumpOffset: 7,
    };
    const o = organic({ x: 5, y: 5 }, { dna: dna({ behavior: behaviorOf(instruction) }), size: 400 });
    place(grid, o);
    decideAction(grid, settings, new MockRNG([0]));
    expect(o.currentState).toBe(7); // 400/1000 = 0.4 < 0.5
  });

  it('reads Age as age divided by MaxAge', () => {
    const settings = testSettings({ maxAge: 1000 });
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Rest' },
      sensor: 'Age',
      comparator: '>=',
      threshold: 0.9,
      jumpOffset: 3,
    };
    const o = organic({ x: 5, y: 5 }, { dna: dna({ behavior: behaviorOf(instruction) }), age: 950 });
    place(grid, o);
    decideAction(grid, settings, new MockRNG([0]));
    expect(o.currentState).toBe(3); // 950/1000 = 0.95 >= 0.9
  });

  it('reads Crowding as the count of other organics within visionRange', () => {
    const settings = testSettings({ visionRange: 2 });
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Rest' },
      sensor: 'Crowding',
      comparator: '>=',
      threshold: 2,
      jumpOffset: 5,
    };
    const o = organic({ x: 5, y: 5 }, { dna: dna({ behavior: behaviorOf(instruction) }) });
    const neighborA = organic({ x: 4, y: 5 });
    const neighborB = organic({ x: 6, y: 6 });
    const farAway = organic({ x: 9, y: 9 });
    place(grid, o, neighborA, neighborB, farAway);
    decideAction(grid, settings, new MockRNG([0]));
    expect(o.currentState).toBe(5); // neighborA and neighborB are in range; farAway (distance 4) isn't
  });

  it('Move(TowardConsume) sets direction toward the largest matching entity in range', () => {
    const settings = testSettings({ visionRange: 2 });
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Move', mode: 'TowardConsume' },
      sensor: 'Random',
      comparator: '>=',
      threshold: 2,
      jumpOffset: 0,
    };
    const o = organic({ x: 2, y: 2 }, { dna: dna({ consume: 'Green', behavior: behaviorOf(instruction) }) });
    const smallCloseMatch = mineral({ x: 1, y: 1 }, 'Green', 50);
    const largeFarMatch = mineral({ x: 3, y: 4 }, 'Green', 500);
    const nonMatch = mineral({ x: 2, y: 3 }, 'Red', 9999);
    place(grid, o, smallCloseMatch, largeFarMatch, nonMatch);
    decideAction(grid, settings, new MockRNG([0]));
    expect(o.direction).toEqual({ x: 1, y: 1 });
  });

  it('Move(TowardConsume) does not downgrade the target when a later candidate is smaller', () => {
    const settings = testSettings({ visionRange: 2 });
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Move', mode: 'TowardConsume' },
      sensor: 'Random',
      comparator: '>=',
      threshold: 2,
      jumpOffset: 0,
    };
    const o = organic({ x: 2, y: 2 }, { dna: dna({ consume: 'Green', behavior: behaviorOf(instruction) }) });
    const largeClose = mineral({ x: 1, y: 1 }, 'Green', 500);
    const smallFar = mineral({ x: 3, y: 4 }, 'Green', 50);
    place(grid, o, largeClose, smallFar);
    decideAction(grid, settings, new MockRNG([0]));
    expect(o.direction).toEqual({ x: -1, y: -1 });
  });

  it("Move(TowardConsume) matches against an organic prey's body substance", () => {
    const settings = testSettings({ visionRange: 1 });
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Move', mode: 'TowardConsume' },
      sensor: 'Random',
      comparator: '>=',
      threshold: 2,
      jumpOffset: 0,
    };
    const hunter = organic({ x: 2, y: 2 }, { dna: dna({ consume: 'Blue', behavior: behaviorOf(instruction) }) });
    const prey = organic({ x: 1, y: 2 }, { dna: dna({ body: 'Blue' }), size: 900 });
    place(grid, hunter, prey);
    decideAction(grid, settings, new MockRNG([0]));
    expect(hunter.direction).toEqual({ x: -1, y: 0 });
  });

  it('Move(TowardConsume) sets direction to null when no matching entity is in range', () => {
    const settings = testSettings({ visionRange: 1 });
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Move', mode: 'TowardConsume' },
      sensor: 'Random',
      comparator: '>=',
      threshold: 2,
      jumpOffset: 0,
    };
    const o = organic({ x: 5, y: 5 }, { dna: dna({ consume: 'Green', behavior: behaviorOf(instruction) }) });
    place(grid, o);
    decideAction(grid, settings, new MockRNG([0]));
    expect(o.direction).toBeNull();
  });

  it('Move(Hold) always sets direction to null, even with a matching entity adjacent', () => {
    const settings = testSettings({ visionRange: 2 });
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Move', mode: 'Hold' },
      sensor: 'Random',
      comparator: '>=',
      threshold: 2,
      jumpOffset: 0,
    };
    const o = organic({ x: 5, y: 5 }, { dna: dna({ consume: 'Green', behavior: behaviorOf(instruction) }) });
    const food = mineral({ x: 6, y: 5 }, 'Green', 100);
    place(grid, o, food);
    decideAction(grid, settings, new MockRNG([0]));
    expect(o.direction).toBeNull();
    expect(o.chosenAction).toEqual({ type: 'Move', mode: 'Hold' });
  });

  it('Move(AwayFromToxin) sets direction away from the nearest matching-toxin entity in range', () => {
    const settings = testSettings({ visionRange: 2 });
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Move', mode: 'AwayFromToxin' },
      sensor: 'Random',
      comparator: '>=',
      threshold: 2,
      jumpOffset: 0,
    };
    const o = organic({ x: 5, y: 5 }, { dna: dna({ toxin: 'Red', behavior: behaviorOf(instruction) }) });
    const toxin = mineral({ x: 6, y: 6 }, 'Red', 100);
    place(grid, o, toxin);
    decideAction(grid, settings, new MockRNG([0]));
    expect(o.direction).toEqual({ x: -1, y: -1 });
  });

  it('Move(AwayFromToxin) sets direction to null when no matching entity is in range', () => {
    const settings = testSettings({ visionRange: 1 });
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Move', mode: 'AwayFromToxin' },
      sensor: 'Random',
      comparator: '>=',
      threshold: 2,
      jumpOffset: 0,
    };
    const o = organic({ x: 5, y: 5 }, { dna: dna({ toxin: 'Red', behavior: behaviorOf(instruction) }) });
    place(grid, o);
    decideAction(grid, settings, new MockRNG([0]));
    expect(o.direction).toBeNull();
  });

  it('Move(AwayFromToxin) sets direction to null when fleeing would leave the grid', () => {
    const settings = testSettings({ visionRange: 1 });
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Move', mode: 'AwayFromToxin' },
      sensor: 'Random',
      comparator: '>=',
      threshold: 2,
      jumpOffset: 0,
    };
    const o = organic({ x: 0, y: 0 }, { dna: dna({ toxin: 'Red', behavior: behaviorOf(instruction) }) });
    const toxin = mineral({ x: 1, y: 1 }, 'Red', 100); // fleeing steps to (-1,-1), off-grid
    place(grid, o, toxin);
    decideAction(grid, settings, new MockRNG([0]));
    expect(o.direction).toBeNull();
  });

  it('Move(TowardOpenSpace) steps into the free adjacent cell with the fewest nearby entities', () => {
    const settings = testSettings({ visionRange: 2 });
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Move', mode: 'TowardOpenSpace' },
      sensor: 'Random',
      comparator: '>=',
      threshold: 2,
      jumpOffset: 0,
    };
    const o = organic({ x: 5, y: 5 }, { dna: dna({ behavior: behaviorOf(instruction) }) });
    // A small cluster near (3,3)-(3,4) makes the grid's upper-left neighbors more
    // crowded than (6,4), which only sees `o` itself within visionRange.
    const crowd1 = organic({ x: 3, y: 3 });
    const crowd2 = organic({ x: 3, y: 4 });
    place(grid, o, crowd1, crowd2);
    decideAction(grid, settings, new MockRNG([0]));
    expect(o.direction).toEqual({ x: 1, y: -1 });
  });

  it('Move(TowardOpenSpace) sets direction to null when every adjacent cell is occupied', () => {
    const settings = testSettings({ visionRange: 1 });
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Move', mode: 'TowardOpenSpace' },
      sensor: 'Random',
      comparator: '>=',
      threshold: 2,
      jumpOffset: 0,
    };
    const o = organic({ x: 5, y: 5 }, { dna: dna({ behavior: behaviorOf(instruction) }) });
    place(grid, o);
    for (const p of grid.positionsInRange(5, 5, 1)) {
      place(grid, organic(p));
    }
    decideAction(grid, settings, new MockRNG([0]));
    expect(o.direction).toBeNull();
  });

  it('Move(Random) steps in the direction drawn from rng', () => {
    const settings = testSettings();
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Move', mode: 'Random' },
      sensor: 'Random',
      comparator: '>=',
      threshold: 2, // unreachable, so the sensor draw's value doesn't affect this test
      jumpOffset: 0,
    };
    const o = organic({ x: 5, y: 5 }, { dna: dna({ behavior: behaviorOf(instruction) }) });
    place(grid, o);
    // rng.next()=0 -> int(8)=0 -> first offset option (-1,-1); second next()=0.9 is the sensor draw.
    decideAction(grid, settings, new MockRNG([0, 0.9]));
    expect(o.direction).toEqual({ x: -1, y: -1 });
  });

  it('Move(Random) sets direction to null when the drawn step would leave the grid', () => {
    const settings = testSettings();
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Move', mode: 'Random' },
      sensor: 'Random',
      comparator: '>=',
      threshold: 2,
      jumpOffset: 0,
    };
    const o = organic({ x: 0, y: 0 }, { dna: dna({ behavior: behaviorOf(instruction) }) });
    place(grid, o);
    // rng.next()=0 -> int(8)=0 -> first offset option (-1,-1) -> target (-1,-1) is off-grid.
    decideAction(grid, settings, new MockRNG([0, 0.9]));
    expect(o.direction).toBeNull();
  });

  it('Rest always sets direction to null, even with a matching entity adjacent', () => {
    const settings = testSettings({ visionRange: 2 });
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Rest' },
      sensor: 'Random',
      comparator: '>=',
      threshold: 2,
      jumpOffset: 0,
    };
    const o = organic({ x: 5, y: 5 }, { dna: dna({ consume: 'Green', behavior: behaviorOf(instruction) }) });
    const food = mineral({ x: 6, y: 5 }, 'Green', 100);
    place(grid, o, food);
    decideAction(grid, settings, new MockRNG([0]));
    expect(o.direction).toBeNull();
    expect(o.chosenAction).toEqual({ type: 'Rest' });
  });
});
