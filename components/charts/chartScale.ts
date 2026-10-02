/**
 * Axis maths for the Tools charts: round-number scales, compact money labels
 * and year ticks. Pure, so it is unit-tested.
 */

export interface NiceScale {
  max: number;
  ticks: number[];
}

/**
 * A y scale from 0 to a round maximum, with round ticks (1, 2, 2.5, 5 × 10ⁿ):
 * 3 to 5 intervals, the lowest top that clears the data by a little (room for
 * an end dot), and the fewest intervals on a tie.
 */
export const niceScale = (max: number, maxIntervals = 5): NiceScale => {
  if (!(max > 0) || !Number.isFinite(max)) return { max: 1, ticks: [0, 1] };
  const target = max * 1.04;
  const base = Math.pow(10, Math.floor(Math.log10(max / maxIntervals)));
  let best: { step: number; intervals: number; top: number } | null = null;
  for (const unit of [1, 2, 2.5, 5, 10, 20, 25, 50]) {
    const step = unit * base;
    const intervals = Math.ceil(target / step - 1e-9);
    if (intervals < 3 || intervals > maxIntervals) continue;
    const top = intervals * step;
    if (!best || top < best.top - 1e-9 || (Math.abs(top - best.top) < 1e-9 && intervals < best.intervals)) {
      best = { step, intervals, top };
    }
  }
  const { step, top } = best ?? { step: max, top: max };
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  return { max: Number(top.toFixed(10)), ticks };
};

/** 1,200 → £1.2K, 2,500,000 → £2.5M; for axis labels, where space is short. */
export const compactMoney = (value: number, symbol: string): string => {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const scaled = (n: number, suffix: string) => `${sign}${symbol}${Number(Math.abs(n).toFixed(1))}${suffix}`;
  if (abs >= 1e9) return scaled(value / 1e9, 'B');
  if (abs >= 1e6) return scaled(value / 1e6, 'M');
  if (abs >= 1e3) return scaled(value / 1e3, 'K');
  return `${sign}${symbol}${Math.round(abs)}`;
};

const YEAR_STEPS = [1, 2, 5, 10, 20, 25, 50];

/** Month indices (0, 12, 24, …) for a time axis, at most `maxTicks` of them. */
export const yearTicks = (totalMonths: number, maxTicks = 6): number[] => {
  const years = totalMonths / 12;
  const step = YEAR_STEPS.find((s) => Math.floor(years / s) + 1 <= maxTicks) ?? 50;
  const ticks: number[] = [];
  for (let y = 0; y <= years + 1e-9; y += step) ticks.push(Math.round(y * 12));
  return ticks;
};

/** Bar indices to label on a yearly axis, where bar i is year i + 1. */
export const barYearTicks = (count: number, maxTicks = 6): number[] => {
  const step = YEAR_STEPS.find((s) => Math.floor(count / s) <= maxTicks) ?? 50;
  const ticks: number[] = [];
  for (let year = step; year <= count; year += step) ticks.push(year - 1);
  return ticks;
};

// ---------------------------------------------------------------------------
// Plot geometry
// ---------------------------------------------------------------------------

/** Breathing room inside the plot so end-dots and the top gridline are never clipped. */
export const PLOT_PAD = { top: 10, right: 10, left: 0 } as const;

export type Snap = 'point' | 'band';

export interface PlotScales {
  /** Horizontal position of data index i: on the point (lines) or the centre of its band (bars). */
  x: (i: number) => number;
  y: (v: number) => number;
  /** Width of one band (bars); the full plot for point charts. */
  band: number;
}

export const plotScales = (count: number, snap: Snap, yMax: number, width: number, height: number): PlotScales => {
  const inner = Math.max(0, width - PLOT_PAD.left - PLOT_PAD.right);
  const band = snap === 'band' ? inner / Math.max(1, count) : inner;
  const x =
    snap === 'band'
      ? (i: number) => PLOT_PAD.left + (i + 0.5) * band
      : (i: number) => PLOT_PAD.left + (count > 1 ? (i / (count - 1)) * inner : inner / 2);
  const y = (v: number) => PLOT_PAD.top + (1 - v / yMax) * (height - PLOT_PAD.top);
  return { x, y, band };
};

/** The data index nearest a pointer at horizontal position `px` within the plot. */
export const indexAtX = (px: number, count: number, snap: Snap, width: number): number => {
  const inner = width - PLOT_PAD.left - PLOT_PAD.right;
  if (count <= 1 || inner <= 0) return 0;
  const raw =
    snap === 'band' ? Math.floor((px - PLOT_PAD.left) / (inner / count)) : Math.round(((px - PLOT_PAD.left) / inner) * (count - 1));
  return Math.max(0, Math.min(count - 1, raw));
};
