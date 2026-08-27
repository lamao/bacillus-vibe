import { describe, expect, it } from 'vitest';
import { ZERO_AVERAGE_RATIOS } from '../../src/ui/averages';
import { StatsHistory, ZERO_BIRTHS_DEATHS_RATE } from '../../src/ui/statsHistory';

/** Records a sample with empty substance breakdowns and zeroed averages/rates unless overridden, to keep tests focused on the field(s) under test. */
function record(
  history: StatsHistory,
  tick: number,
  total: number,
  minerals: number,
  overrides: { averages?: typeof ZERO_AVERAGE_RATIOS; birthsDeaths?: typeof ZERO_BIRTHS_DEATHS_RATE } = {},
): void {
  history.record(
    tick,
    total,
    minerals,
    new Map(),
    new Map(),
    new Map(),
    new Map(),
    overrides.averages ?? ZERO_AVERAGE_RATIOS,
    overrides.birthsDeaths ?? ZERO_BIRTHS_DEATHS_RATE,
  );
}

describe('StatsHistory', () => {
  it('returns no samples before anything is recorded', () => {
    const history = new StatsHistory();
    expect(history.window(500)).toEqual([]);
  });

  it('records one sample per distinct tick', () => {
    const history = new StatsHistory();
    record(history, 1, 10, 5);
    record(history, 1, 99, 9); // same tick, ignored
    record(history, 2, 20, 6);
    expect(history.window(500)).toEqual([
      {
        tick: 1,
        total: 10,
        minerals: 5,
        bySubstance: new Map(),
        byConsume: new Map(),
        byProduce: new Map(),
        byToxin: new Map(),
        averages: ZERO_AVERAGE_RATIOS,
        birthsDeaths: ZERO_BIRTHS_DEATHS_RATE,
      },
      {
        tick: 2,
        total: 20,
        minerals: 6,
        bySubstance: new Map(),
        byConsume: new Map(),
        byProduce: new Map(),
        byToxin: new Map(),
        averages: ZERO_AVERAGE_RATIOS,
        birthsDeaths: ZERO_BIRTHS_DEATHS_RATE,
      },
    ]);
  });

  it('filters window() to samples within the last N ticks of the latest one', () => {
    const history = new StatsHistory();
    for (let tick = 0; tick <= 1000; tick += 100) {
      record(history, tick, tick, 0);
    }
    const windowed = history.window(500);
    expect(windowed.map((s) => s.tick)).toEqual([500, 600, 700, 800, 900, 1000]);
  });

  it('prunes samples older than the widest offered window (10,000 ticks)', () => {
    const history = new StatsHistory();
    record(history, 0, 0, 0);
    record(history, 10_001, 1, 0);
    // the tick-0 sample is now more than 10,000 ticks behind the latest and should be dropped
    expect(history.window(10_000).map((s) => s.tick)).toEqual([10_001]);
  });

  it('never prunes down to zero samples even when the very first one is already stale', () => {
    const history = new StatsHistory();
    record(history, 0, 0, 0);
    expect(history.window(10_000).map((s) => s.tick)).toEqual([0]);
  });

  it('records the averages alongside the population counts for each sample', () => {
    const history = new StatsHistory();
    const averages = { avgEnergy: 0.5, avgAge: 0.2, avgSize: 0.8 };
    record(history, 1, 10, 0, { averages });
    expect(history.window(500)[0].averages).toEqual(averages);
  });

  it('records the births/deaths rate alongside the population counts for each sample', () => {
    const history = new StatsHistory();
    const birthsDeaths = { births: 3, deaths: 1 };
    record(history, 1, 10, 0, { birthsDeaths });
    expect(history.window(500)[0].birthsDeaths).toEqual(birthsDeaths);
  });

  it('records the mineral count alongside the population counts for each sample', () => {
    const history = new StatsHistory();
    record(history, 1, 10, 42);
    expect(history.window(500)[0].minerals).toBe(42);
  });

  it('records the consume/produce/toxin substance breakdowns alongside body composition for each sample', () => {
    const history = new StatsHistory();
    const byConsume = new Map([['Sun', 3]] as const);
    const byProduce = new Map([['Green', 2]] as const);
    const byToxin = new Map([['Red', 1]] as const);
    history.record(1, 10, 0, new Map(), byConsume, byProduce, byToxin, ZERO_AVERAGE_RATIOS, ZERO_BIRTHS_DEATHS_RATE);
    const sample = history.window(500)[0];
    expect(sample.byConsume).toEqual(byConsume);
    expect(sample.byProduce).toEqual(byProduce);
    expect(sample.byToxin).toEqual(byToxin);
  });
});
