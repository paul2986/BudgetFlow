import { useState } from 'react';
import { View, Text, type LayoutChangeEvent } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { type, radius, tabularNums } from '../../styles/tokens';

/**
 * One stacked horizontal bar for parts of a whole (design/DESIGN.md §2.9): a
 * 2px surface gap between segments, rounded outer ends, and a label inside a
 * segment only when it fits with padding. The bar is one accessibility
 * element; the caller's legend and cards carry the values as text.
 */

export interface AllocationSegment {
  key: string;
  /** Share of the whole track, 0 to 1. Segments sum to at most 1; the rest stays empty. */
  fraction: number;
  color: string;
  /** Printed inside the segment when there is room. */
  label?: string;
  labelColor?: string;
}

interface AllocationBarProps {
  segments: AllocationSegment[];
  accessibilityLabel: string;
  height?: number;
}

const GAP = 2;
/** Narrowest segment, in px, that still fits a label like "58%". */
const MIN_LABEL_WIDTH = 44;

export default function AllocationBar({ segments, accessibilityLabel, height = 32 }: AllocationBarProps) {
  const { tokens } = useTheme();
  const [width, setWidth] = useState(0);
  const visible = segments.filter((s) => s.fraction > 0);
  const filled = visible.reduce((sum, s) => sum + s.fraction, 0);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={{
        height,
        flexDirection: 'row',
        gap: GAP,
        overflow: 'hidden',
        borderRadius: radius.sm,
        backgroundColor: tokens.colors.surfaceSunken,
      }}
    >
      {visible.map((s) => {
        const px = s.fraction * width;
        return (
          <View
            key={s.key}
            style={{
              flexGrow: s.fraction,
              flexShrink: 0,
              flexBasis: 0,
              backgroundColor: s.color,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {s.label && px >= MIN_LABEL_WIDTH ? (
              <Text
                numberOfLines={1}
                style={[type.caption, tabularNums, { color: s.labelColor ?? tokens.colors.onBrand }]}
              >
                {s.label}
              </Text>
            ) : null}
          </View>
        );
      })}
      {/* The unfilled remainder (the track showing through). */}
      {filled < 1 ? <View style={{ flexGrow: 1 - filled, flexShrink: 0, flexBasis: 0 }} /> : null}
    </View>
  );
}
