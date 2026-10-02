import React, { useMemo } from 'react';
import { Circle, Path } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import ChartFrame, { type ChartContext, type ReadoutItem } from './ChartFrame';
import { niceScale, plotScales } from './chartScale';

/**
 * Balance over time, one value per point (a month).
 *
 * - `stacked`: the series are bands piled bottom to top (savings: what you put
 *   in, then the interest on top). The widening top band is the compounding.
 * - `overlay`: independent lines on one axis (a loan balance, with and without
 *   extra payments). Only the first gets a wash beneath it.
 *
 * Marks follow DESIGN.md §2.9 and the dataviz rules: 2px round lines, a wash
 * (not a block) for areas, end dots with a 2px surface ring.
 */

export interface AreaSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

interface AreaChartProps {
  variant: 'stacked' | 'overlay';
  series: AreaSeries[];
  xTicks: { index: number; label: string }[];
  formatAxis: (value: number) => string;
  heading: (index: number) => string;
  readout: (index: number) => ReadoutItem[];
  summary: string;
  plotHeight?: number;
  /** Where the readout and end dots sit before anything is chosen. */
  rest?: 'end' | 'start';
}

const WASH_OPACITY = 0.2;

const linePoints = (values: number[], x: (i: number) => number, y: (v: number) => number): string[] =>
  values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`);

/** The closed shape between an upper and a lower edge. */
const bandPath = (top: number[], bottom: number[], x: (i: number) => number, y: (v: number) => number): string => {
  const forward = linePoints(top, x, y);
  const back = bottom.map((v, i) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).reverse();
  return `${forward.join('')}${back.join('')}Z`;
};

interface MarksProps {
  variant: AreaChartProps['variant'];
  /** Upper edge of each series: running totals when stacked, the values when overlaid. */
  edges: number[][];
  colors: string[];
  yMax: number;
  width: number;
  height: number;
}

// The paths are long (a point per month) and only change with the data, so
// scrubbing re-renders the dots and crosshair without rebuilding them.
const Marks = React.memo(function Marks({ variant, edges, colors, yMax, width, height }: MarksProps) {
  const count = edges[0].length;
  const { x, y } = plotScales(count, 'point', yMax, width, height);
  const zeros = new Array<number>(count).fill(0);

  return (
    <>
      {variant === 'stacked'
        ? edges.map((top, k) => (
            <Path key={`band${k}`} d={bandPath(top, k === 0 ? zeros : edges[k - 1], x, y)} fill={colors[k]} fillOpacity={WASH_OPACITY} />
          ))
        : (
            <Path d={bandPath(edges[0], zeros, x, y)} fill={colors[0]} fillOpacity={WASH_OPACITY} />
          )}
      {edges.map((values, k) => (
        <Path
          key={`line${k}`}
          d={linePoints(values, x, y).join('')}
          fill="none"
          stroke={colors[k]}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </>
  );
});

export default function AreaChart({ variant, series, xTicks, formatAxis, heading, readout, summary, plotHeight, rest }: AreaChartProps) {
  const { tokens } = useTheme();
  const count = series[0]?.values.length ?? 0;

  const edges = useMemo(() => {
    if (variant === 'overlay') return series.map((s) => s.values);
    const running = new Array<number>(count).fill(0);
    return series.map((s) => s.values.map((v, i) => (running[i] += v)));
  }, [variant, series, count]);

  const yScale = useMemo(() => niceScale(Math.max(0, ...edges.map((e) => Math.max(...e)))), [edges]);
  const colors = useMemo(() => series.map((s) => s.color), [series]);

  if (count < 2) return null;

  const renderMarks = ({ x, y, width, height, shown }: ChartContext) => {
    const at = shown;
    return (
      <>
        <Marks variant={variant} edges={edges} colors={colors} yMax={yScale.max} width={width} height={height} />
        {edges.map((values, k) => (
          // Ring in the card surface so a dot stays legible where lines meet.
          <Circle
            key={`dot${k}`}
            cx={x(at)}
            cy={y(values[at])}
            r={5}
            fill={colors[k]}
            stroke={tokens.colors.surface}
            strokeWidth={2}
          />
        ))}
      </>
    );
  };

  return (
    <ChartFrame
      count={count}
      snap="point"
      yMax={yScale.max}
      yTicks={yScale.ticks}
      xTicks={xTicks}
      formatAxis={formatAxis}
      heading={heading}
      readout={readout}
      summary={summary}
      renderMarks={renderMarks}
      plotHeight={plotHeight}
      rest={rest}
    />
  );
}
