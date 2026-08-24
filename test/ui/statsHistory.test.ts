import { describe, expect, it } from 'vitest';
import { ZERO_AVERAGE_RATIOS } from '../../src/ui/averages';
import { StatsHistory, ZERO_BIRTHS_DEATHS_RATE } from '../../src/ui/statsHistory';

describe('StatsHistory', () => {
  it('returns no samples before anything is recorded', () => {
    const history = new StatsHistory();
    expect(history.window(500)).toEqual([]);
  });

  it('records one sample per distinct tick', () => {
    const history = new StatsHistory();
    history.record(1, 10, 5, new Map(), ZERO_AVERAGE_RATIOS, ZERO_BIRTHS_DEATHS_RATE);
    history.record(1, 99, 9, new Map(), ZERO_AVERAGE_RATIOS, ZERO_BIRTHS_DEATHS_RATE); // same tick, ignored
    history.record(2, 20, 6, new Map(), ZERO_AVERAGE_RATIOS, ZERO_BIRTHS_DEATHS_RATE);
    expect(history.window(500)).toEqual([
      { tick: 1, total: 10, minerals: 5, bySubstance: new Map(), averages: ZERO_AVERAGE_RATIOS, birthsDeaths: ZERO_BIRTHS_DEATHS_RATE },
      { tick: 2, total: 20, minerals: 6, bySubstance: new Map(), averages: ZERO_AVERAGE_RATIOS, birthsDeaths: ZERO_BIRTHS_DEATHS_RATE },
    ]);
  });

  it('filters window() to samples within the last N ticks of the latest one', () => {
    const history = new StatsHistory();
    for (let tick = 0; tick <= 1000; tick += 100) {
      history.record(tick, tick, 0, new Map(), ZERO_AVERAGE_RATIOS, ZERO_BIRTHS_DEATHS_RATE);
    }
    const windowed = history.window(500);
    expect(windowed.map((s) => s.tick)).toEqual([500, 600, 700, 800, 900, 1000]);
  });

  it('prunes samples older than the widest offered window (10,000 ticks)', () => {
    const history = new StatsHistory();
    history.record(0, 0, 0, new Map(), ZERO_AVERAGE_RATIOS, ZERO_BIRTHS_DEATHS_RATE);
    history.record(10_001, 1, 0, new Map(), ZERO_AVERAGE_RATIOS, ZERO_BIRTHS_DEATHS_RATE);
    // the tick-0 sample is now more than 10,000 ticks behind the latest and should be dropped
    expect(history.window(10_000).map((s) => s.tick)).toEqual([10_001]);
  });

  it('never prunes down to zero samples even when the very first one is already stale', () => {
    const history = new StatsHistory();
    history.record(0, 0, 0, new Map(), ZERO_AVERAGE_RATIOS, ZERO_BIRTHS_DEATHS_RATE);
    expect(history.window(10_000).map((s) => s.tick)).toEqual([0]);
  });

  it('records the averages alongside the population counts for each sample', () => {
    const history = new StatsHistory();
    const averages = { avgEnergy: 0.5, avgAge: 0.2, avgSize: 0.8 };
    history.record(1, 10, 0, new Map(), averages, ZERO_BIRTHS_DEATHS_RATE);
    expect(history.window(500)[0].averages).toEqual(averages);
  });

  it('records the births/deaths rate alongside the population counts for each sample', () => {
    const history = new StatsHistory();
    const birthsDeaths = { births: 3, deaths: 1 };
    history.record(1, 10, 0, new Map(), ZERO_AVERAGE_RATIOS, birthsDeaths);
    expect(history.window(500)[0].birthsDeaths).toEqual(birthsDeaths);
  });

  it('records the mineral count alongside the population counts for each sample', () => {
    const history = new StatsHistory();
    history.record(1, 10, 42, new Map(), ZERO_AVERAGE_RATIOS, ZERO_BIRTHS_DEATHS_RATE);
    expect(history.window(500)[0].minerals).toBe(42);
  });
});
