import { describe, expect, it } from 'vitest';
import { StatsHistory } from '../../src/ui/statsHistory';

describe('StatsHistory', () => {
  it('returns no samples before anything is recorded', () => {
    const history = new StatsHistory();
    expect(history.window(500)).toEqual([]);
  });

  it('records one sample per distinct tick', () => {
    const history = new StatsHistory();
    history.record(1, 10, new Map());
    history.record(1, 99, new Map()); // same tick, ignored
    history.record(2, 20, new Map());
    expect(history.window(500)).toEqual([
      { tick: 1, total: 10, bySubstance: new Map() },
      { tick: 2, total: 20, bySubstance: new Map() },
    ]);
  });

  it('filters window() to samples within the last N ticks of the latest one', () => {
    const history = new StatsHistory();
    for (let tick = 0; tick <= 1000; tick += 100) {
      history.record(tick, tick, new Map());
    }
    const windowed = history.window(500);
    expect(windowed.map((s) => s.tick)).toEqual([500, 600, 700, 800, 900, 1000]);
  });

  it('prunes samples older than the widest offered window (10,000 ticks)', () => {
    const history = new StatsHistory();
    history.record(0, 0, new Map());
    history.record(10_001, 1, new Map());
    // the tick-0 sample is now more than 10,000 ticks behind the latest and should be dropped
    expect(history.window(10_000).map((s) => s.tick)).toEqual([10_001]);
  });

  it('never prunes down to zero samples even when the very first one is already stale', () => {
    const history = new StatsHistory();
    history.record(0, 0, new Map());
    expect(history.window(10_000).map((s) => s.tick)).toEqual([0]);
  });
});
