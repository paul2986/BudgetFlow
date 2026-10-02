import React, { useMemo } from 'react';
import { Path, Rect } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import ChartFrame, { type ChartContext, type ReadoutItem } from './ChartFrame';
import { niceScale, plotScales } from './chartScale';
import type { AreaSeries as BarSeries } from './AreaChart';

/**
 * Stacked columns, one per year: what each period is made of (a mortgage year's
 * principal and interest). Columns are thin (24px at most), square at the
 * baseline with a 4px rounded top, and segments are parted by a 2px gap of
 * surface rather than a border (DESIGN.md §2.9).
 */

export type { BarSeries };

interface BarChartProps {
  /** Segments bottom to top; every series has one value per column. */
  series: BarSeries[];
  xTicks: { index: number; label: string }[];
  formatAxis: (value: number) => string;
  heading: (index: number) => string;
  readout: (index: number) => ReadoutItem[];
  summary: string;
  plotHeight?: number;
}

const MAX_BAR = 24;
const GAP = 2;
const RADIUS = 4;

const segmentPath = (x0: number, x1: number, top: number, bottom: number, rounded: boolean): string => {
  if (bottom - top <= 0.5) return '';
  const r = rounded ? Math.min(RADIUS, (x1 - x0) / 2, bottom - top) : 0;
  if (r <= 0) return `M${x0},${bottom}L${x0},${top}L${x1},${top}L${x1},${bottom}Z`;
  return `M${x0},${bottom}L${x0},${top + r}Q${x0},${top} ${x0 + r},${top}L${x1 - r},${top}Q${x1},${top} ${x1},${top + r}L${x1},${bottom}Z`;
};

interface BarsProps {
  series: BarSeries[];
  yMax: number;
  width: number;
  height: number;
}

// Rebuilt only when the data or size changes, not on every hover.
const Bars = React.memo(function Bars({ series, yMax, width, height }: BarsProps) {
  const count = series[0].values.length;
  const { x, y, band } = plotScales(count, 'band', yMax, width, height);
  const barWidth = Math.max(2, Math.min(MAX_BAR, band - GAP));
  const paths: React.ReactElement[] = [];

  for (let i = 0; i < count; i++) {
    const filled = series.map((s) => s.values[i] > 0);
    const topmost = filled.lastIndexOf(true);
    let base = 0;
    series.forEach((s, k) => {
      const next = base + s.values[i];
      if (filled[k]) {
        // Half the gap comes off each side of a shared edge.
        const lower = k > 0 && filled.slice(0, k).some(Boolean) ? GAP / 2 : 0;
        const upper = k < topmost ? GAP / 2 : 0;
        const d = segmentPath(x(i) - barWidth / 2, x(i) + barWidth / 2, y(next) + upper, y(base) - lower, k === topmost);
        if (d) paths.push(<Path key={`${i}-${s.key}`} d={d} fill={s.color} />);
      }
      base = next;
    });
  }
  return <>{paths}</>;
});

export default function BarChart({ series, xTicks, formatAxis, heading, readout, summary, plotHeight }: BarChartProps) {
  const { tokens } = useTheme();
  const count = series[0]?.values.length ?? 0;

  const yScale = useMemo(() => {
    const totals = series[0]?.values.map((_, i) => series.reduce((sum, s) => sum + s.values[i], 0)) ?? [];
    return niceScale(Math.max(0, ...totals));
  }, [series]);

  if (count < 1) return null;

  const renderMarks = ({ x, band, width, height, selected }: ChartContext) => (
    <>
      {selected != null ? (
        // The chosen year lifts off the page on a sunken strip.
        <Rect x={x(selected) - band / 2} y={0} width={band} height={height} fill={tokens.colors.surfaceSunken} />
      ) : null}
      <Bars series={series} yMax={yScale.max} width={width} height={height} />
    </>
  );

  return (
    <ChartFrame
      count={count}
      snap="band"
      yMax={yScale.max}
      yTicks={yScale.ticks}
      xTicks={xTicks}
      formatAxis={formatAxis}
      heading={heading}
      readout={readout}
      summary={summary}
      renderMarks={renderMarks}
      plotHeight={plotHeight}
    />
  );
}
