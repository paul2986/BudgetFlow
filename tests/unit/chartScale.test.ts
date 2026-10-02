import { describe, expect, it } from 'vitest';
import {
  barYearTicks,
  compactMoney,
  indexAtX,
  niceScale,
  PLOT_PAD,
  plotScales,
  yearTicks,
} from '../../components/charts/chartScale';

describe('niceScale', () => {
  it('rounds the top up to a clean number and ticks from zero', () => {
    expect(niceScale(87_432)).toEqual({ max: 100_000, ticks: [0, 25_000, 50_000, 75_000, 100_000] });
    expect(niceScale(1_234_567).max).toBe(1_500_000);
    // Tight to the data: £21k of bars gets a £25k axis, not £30k.
    expect(niceScale(20_820)).toEqual({ max: 25_000, ticks: [0, 5_000, 10_000, 15_000, 20_000, 25_000] });
    expect(niceScale(9_800)).toEqual({ max: 12_500, ticks: [0, 2_500, 5_000, 7_500, 10_000, 12_500] });
  });

  it('never clips the data and keeps the tick count small', () => {
    for (const max of [0.5, 3, 77, 1_999, 250_001, 4_200_000, 91_000_000]) {
      const s = niceScale(max);
      expect(s.max).toBeGreaterThanOrEqual(max * 1.04 - 1e-9);
      expect(s.ticks[0]).toBe(0);
      expect(s.ticks.at(-1)).toBe(s.max);
      expect(s.ticks.length).toBeLessThanOrEqual(6);
      expect(s.ticks.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('survives empty input', () => {
    expect(niceScale(0).ticks).toEqual([0, 1]);
    expect(niceScale(NaN).max).toBe(1);
  });
});

describe('compactMoney', () => {
  it('shortens thousands, millions and billions', () => {
    expect(compactMoney(0, '£')).toBe('£0');
    expect(compactMoney(950, '$')).toBe('$950');
    expect(compactMoney(1_000, '£')).toBe('£1K');
    expect(compactMoney(2_500, '£')).toBe('£2.5K');
    expect(compactMoney(1_500_000, '€')).toBe('€1.5M');
    expect(compactMoney(3_000_000_000, '$')).toBe('$3B');
  });
});

describe('yearTicks', () => {
  it('picks a readable step for the horizon', () => {
    expect(yearTicks(5 * 12)).toEqual([0, 12, 24, 36, 48, 60]);
    expect(yearTicks(20 * 12)).toEqual([0, 60, 120, 180, 240]);
    expect(yearTicks(30 * 12)).toEqual([0, 120, 240, 360]);
    expect(yearTicks(40 * 12)).toEqual([0, 120, 240, 360, 480]);
  });

  it('never exceeds the limit', () => {
    for (let years = 1; years <= 60; years++) expect(yearTicks(years * 12).length).toBeLessThanOrEqual(6);
  });
});

describe('barYearTicks', () => {
  it('labels bars at round years', () => {
    expect(barYearTicks(30)).toEqual([4, 9, 14, 19, 24, 29]);
    expect(barYearTicks(25)).toEqual([4, 9, 14, 19, 24]);
    expect(barYearTicks(5)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('plot geometry', () => {
  it('spreads points edge to edge and bands evenly', () => {
    const w = 310;
    const inner = w - PLOT_PAD.left - PLOT_PAD.right;
    const line = plotScales(5, 'point', 100, w, 200);
    expect(line.x(0)).toBe(PLOT_PAD.left);
    expect(line.x(4)).toBeCloseTo(PLOT_PAD.left + inner, 9);
    const bars = plotScales(5, 'band', 100, w, 200);
    expect(bars.band).toBeCloseTo(inner / 5, 9);
    expect(bars.x(0)).toBeCloseTo(PLOT_PAD.left + inner / 10, 9);
  });

  it('puts zero on the baseline and the top of the scale at the top pad', () => {
    const { y } = plotScales(5, 'point', 100, 300, 200);
    expect(y(0)).toBe(200);
    expect(y(100)).toBe(PLOT_PAD.top);
  });

  it('finds the nearest index, clamped to the data', () => {
    const w = 310;
    for (const snap of ['point', 'band'] as const) {
      const { x } = plotScales(30, snap, 100, w, 200);
      for (const i of [0, 7, 29]) expect(indexAtX(x(i), 30, snap, w)).toBe(i);
      expect(indexAtX(-50, 30, snap, w)).toBe(0);
      expect(indexAtX(900, 30, snap, w)).toBe(29);
    }
    expect(indexAtX(10, 1, 'point', 300)).toBe(0);
  });
});
