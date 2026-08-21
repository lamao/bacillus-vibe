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

  it('reads an unimplemented sensor as 0 rather than throwing (stub, see #13)', () => {
    const settings = testSettings();
    const grid = emptyGrid(settings);
    const instruction: Instruction = {
      action: { type: 'Rest' },
      sensor: 'EnergyRatio',
      comparator: '>=',
      threshold: 0, // 0 >= 0, so this passes given the sensor reads as 0
      jumpOffset: 4,
    };
    const o = organic({ x: 5, y: 5 }, { dna: dna({ behavior: behaviorOf(instruction) }) });
    place(grid, o);
    expect(() => decideAction(grid, settings, new MockRNG([0]))).not.toThrow();
    expect(o.currentState).toBe(4);
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
