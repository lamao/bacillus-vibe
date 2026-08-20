import { describe, expect, it } from 'vitest';
import { decideDirections } from '../../src/engine/phases';
import { dna, emptyGrid, mineral, organic, place, testSettings } from './fixtures';
import { MockRNG } from './mockRng';

describe('decideDirections (phase 1)', () => {
  it('leaves non-movers without a direction', () => {
    const settings = testSettings();
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { dna: dna({ canMove: false }), direction: { x: 1, y: 1 } });
    place(grid, o);
    decideDirections(grid, settings, new MockRNG([0]));
    expect(o.direction).toBeNull();
  });

  it('picks a random adjacent direction when no matching food is in vision range', () => {
    const settings = testSettings({ visionRange: 1 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 5, y: 5 }, { dna: dna({ canMove: true, consume: 'Green' }) });
    place(grid, o);
    decideDirections(grid, settings, new MockRNG([0])); // index 0 -> first DIRECTIONS entry (-1,-1)
    expect(o.direction).toEqual({ x: -1, y: -1 });
  });

  it('sets direction to null if the randomly chosen direction would leave the grid', () => {
    const settings = testSettings({ visionRange: 1 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 0, y: 0 }, { dna: dna({ canMove: true, consume: 'Green' }) });
    place(grid, o);
    decideDirections(grid, settings, new MockRNG([0])); // (-1,-1) from (0,0) is off-grid
    expect(o.direction).toBeNull();
  });

  it('sets direction toward the largest matching entity in range, ignoring smaller and non-matching ones', () => {
    const settings = testSettings({ visionRange: 2 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 2, y: 2 }, { dna: dna({ canMove: true, consume: 'Green' }) });
    const smallCloseMatch = mineral({ x: 1, y: 1 }, 'Green', 50);
    const largeFarMatch = mineral({ x: 3, y: 4 }, 'Green', 500);
    const nonMatch = mineral({ x: 2, y: 3 }, 'Red', 9999);
    place(grid, o, smallCloseMatch, largeFarMatch, nonMatch);
    decideDirections(grid, settings, new MockRNG([0]));
    expect(o.direction).toEqual({ x: 1, y: 1 });
  });

  it('does not downgrade the target when a later candidate is smaller', () => {
    const settings = testSettings({ visionRange: 2 });
    const grid = emptyGrid(settings);
    const o = organic({ x: 2, y: 2 }, { dna: dna({ canMove: true, consume: 'Green' }) });
    const largeClose = mineral({ x: 1, y: 1 }, 'Green', 500);
    const smallFar = mineral({ x: 3, y: 4 }, 'Green', 50);
    place(grid, o, largeClose, smallFar);
    decideDirections(grid, settings, new MockRNG([0]));
    expect(o.direction).toEqual({ x: -1, y: -1 });
  });

  it('matches against an organic prey\'s body substance', () => {
    const settings = testSettings({ visionRange: 1 });
    const grid = emptyGrid(settings);
    const hunter = organic({ x: 2, y: 2 }, { dna: dna({ canMove: true, consume: 'Blue' }) });
    const prey = organic({ x: 1, y: 2 }, { dna: dna({ body: 'Blue', canMove: false }), size: 900 });
    place(grid, hunter, prey);
    decideDirections(grid, settings, new MockRNG([0]));
    expect(hunter.direction).toEqual({ x: -1, y: 0 });
  });
});
