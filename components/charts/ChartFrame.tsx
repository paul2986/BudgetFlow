import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Platform, type LayoutChangeEvent } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTheme } from '../../hooks/useTheme';
import { type, space, radius, tabularNums } from '../../styles/tokens';
import { indexAtX, plotScales, PLOT_PAD, type PlotScales, type Snap } from './chartScale';

/**
 * Shared chrome for the Tools charts (design/DESIGN.md §2.9): recessive axes,
 * a readout that doubles as the legend, and one way to explore the data.
 *
 * - Drag across the plot (touch), hover (web) or use the arrow keys / VoiceOver
 *   adjust to move a crosshair; tap or click pins a point, "Reset" releases it.
 * - Nothing here gates a value: the readout lists every series at the chosen
 *   point, and each screen also offers a year-by-year table.
 * - The caller draws the marks (lines, areas, bars) from the scales it is given.
 */

export interface ReadoutItem {
  key: string;
  label: string;
  value: string;
  /** Series colour for the swatch; omit for a total that has no mark of its own. */
  color?: string;
  kind?: 'area' | 'line';
  /** Totals read heavier than their parts. */
  strong?: boolean;
}

export interface ChartContext extends PlotScales {
  width: number;
  height: number;
  /** The index chosen by hover, touch or keyboard, or null when nothing is. */
  selected: number | null;
  /** The index the readout is showing: the selection, else where the chart rests. */
  shown: number;
}

interface ChartFrameProps {
  count: number;
  snap: Snap;
  yMax: number;
  yTicks: number[];
  xTicks: { index: number; label: string }[];
  formatAxis: (value: number) => string;
  heading: (index: number) => string;
  readout: (index: number) => ReadoutItem[];
  /** What the chart shows, in a sentence, for screen readers. */
  summary: string;
  renderMarks: (ctx: ChartContext) => React.ReactNode;
  plotHeight?: number;
  /** What to show before anything is chosen: the end of the range, unless a start reads better. */
  rest?: 'end' | 'start';
}

/** A pointer that can hover (a mouse), as opposed to a touch screen in a browser. */
const canHover = (): boolean =>
  Platform.OS === 'web' && typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover)').matches;

const Y_AXIS_WIDTH = 52;
const X_LABEL_WIDTH = 48;

export default function ChartFrame({
  count,
  snap,
  yMax,
  yTicks,
  xTicks,
  formatAxis,
  heading,
  readout,
  summary,
  renderMarks,
  plotHeight = 200,
  rest = 'end',
}: ChartFrameProps) {
  const { tokens } = useTheme();
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  // Web: the keyboard ring shows only for keyboard focus, never after a click.
  const [keyboardFocus, setKeyboardFocus] = useState(false);

  // Gesture callbacks must not close over stale geometry.
  const geometry = useRef({ width: 0, count, snap });
  geometry.current = { width, count, snap };
  const indexAt = useCallback((x: number) => {
    const g = geometry.current;
    return indexAtX(x, g.count, g.snap, g.width);
  }, []);

  const last = count - 1;
  const clamp = (i: number | null) => (i == null ? null : Math.max(0, Math.min(last, i)));
  const selected = clamp(hover ?? pinned);
  const shown = selected ?? (rest === 'start' ? 0 : last);

  const gesture = useMemo(() => {
    // Vertical drags stay with the page's scroll view; a horizontal one scrubs.
    const pan = Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-6, 6])
      .failOffsetY([-14, 14])
      .onStart((e) => setPinned(indexAt(e.x)))
      .onUpdate((e) => setPinned(indexAt(e.x)));
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((e, success) => {
        if (!success) return;
        const i = indexAt(e.x);
        setPinned((current) => (current === i ? null : i));
      });
    return Gesture.Race(pan, tap);
  }, [indexAt]);

  const move = (delta: number) => setPinned(Math.max(0, Math.min(last, shown + delta)));

  const interactionProps =
    Platform.OS === 'web'
      ? {
          focusable: true,
          onFocus: (e: any) => setKeyboardFocus(!!e.target?.matches?.(':focus-visible')),
          onBlur: () => setKeyboardFocus(false),
          onMouseMove: (e: any) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setHover(indexAt(e.clientX - rect.left));
          },
          onMouseLeave: () => setHover(null),
          onKeyDown: (e: any) => {
            const key = e.nativeEvent?.key ?? e.key;
            const handled = { ArrowLeft: () => move(-1), ArrowRight: () => move(1), Home: () => setPinned(0), End: () => setPinned(last), Escape: () => setPinned(null) }[key as string];
            if (handled) {
              e.preventDefault?.();
              handled();
            }
          },
        }
      : {};

  const scales = plotScales(count, snap, yMax, width, plotHeight);
  const items = readout(shown);

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const spoken = `${heading(shown)}. ${items.map((i) => `${i.label} ${i.value}`).join(', ')}`;

  return (
    <View>
      <View style={{ marginBottom: space.s3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28 }}>
          <Text style={[type.caption, { color: tokens.colors.textMuted }]}>{heading(shown)}</Text>
          {selected != null && pinned != null && hover == null ? (
            <Pressable
              onPress={() => setPinned(null)}
              hitSlop={space.s2}
              accessibilityRole="button"
              accessibilityLabel="Reset chart"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={[type.caption, { color: tokens.colors.brand }]}>Reset</Text>
            </Pressable>
          ) : (
            <Text style={[type.caption, { color: tokens.colors.textMuted }]}>
              {canHover() ? 'Hover to explore' : 'Drag to explore'}
            </Text>
          )}
        </View>
        {items.map((item) => (
          <View
            key={item.key}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
              {item.color ? (
                item.kind === 'line' ? (
                  <View style={{ width: 14, height: 2, borderRadius: 1, backgroundColor: item.color, marginRight: space.s2 }} />
                ) : (
                  <View style={{ width: 10, height: 10, borderRadius: radius.sm / 2, backgroundColor: item.color, marginRight: space.s2 }} />
                )
              ) : null}
              <Text style={[type.caption, { color: tokens.colors.textMuted }]} numberOfLines={1}>
                {item.label}
              </Text>
            </View>
            <Text
              style={[item.strong ? type.bodyMed : type.body, tabularNums, { color: tokens.colors.text, marginLeft: space.s3 }]}
              numberOfLines={1}
            >
              {item.value}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: Y_AXIS_WIDTH, height: plotHeight }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {width > 0
            ? yTicks.map((tick) => (
                <Text
                  key={tick}
                  style={[
                    type.caption,
                    tabularNums,
                    { position: 'absolute', right: space.s2, top: scales.y(tick) - 9, color: tokens.colors.textMuted },
                  ]}
                >
                  {formatAxis(tick)}
                </Text>
              ))
            : null}
        </View>

        <View style={{ flex: 1 }}>
          <GestureDetector gesture={gesture}>
            <View
              onLayout={onLayout}
              collapsable={false}
              style={[
                { height: plotHeight, borderRadius: radius.sm },
                Platform.OS === 'web'
                  ? ({
                      outlineStyle: keyboardFocus ? 'solid' : 'none',
                      outlineWidth: 2,
                      outlineColor: tokens.colors.brand,
                      outlineOffset: 2,
                    } as any)
                  : null,
              ]}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={summary}
              accessibilityValue={{ text: spoken }}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(e) => move(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
              {...(interactionProps as object)}
            >
              {width > 0 ? (
                <Svg width={width} height={plotHeight} pointerEvents="none">
                  {yTicks.map((tick) => (
                    <Line
                      key={tick}
                      x1={0}
                      x2={width}
                      y1={scales.y(tick)}
                      y2={scales.y(tick)}
                      stroke={tick === 0 ? tokens.colors.borderStrong : tokens.colors.border}
                      strokeWidth={1}
                    />
                  ))}
                  {snap === 'point' && selected != null ? (
                    <Line
                      x1={scales.x(selected)}
                      x2={scales.x(selected)}
                      y1={PLOT_PAD.top}
                      y2={plotHeight}
                      stroke={tokens.colors.borderStrong}
                      strokeWidth={1}
                    />
                  ) : null}
                  {renderMarks({ ...scales, width, height: plotHeight, selected, shown })}
                </Svg>
              ) : null}
            </View>
          </GestureDetector>

          <View style={{ height: 24, marginTop: space.s1 }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {width > 0
              ? xTicks.map((tick) => (
                  <Text
                    key={tick.index}
                    style={[
                      type.caption,
                      { position: 'absolute', top: 0, left: scales.x(tick.index) - X_LABEL_WIDTH / 2, width: X_LABEL_WIDTH, textAlign: 'center', color: tokens.colors.textMuted },
                    ]}
                    numberOfLines={1}
                  >
                    {tick.label}
                  </Text>
                ))
              : null}
          </View>
        </View>
      </View>
    </View>
  );
}
