import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

/**
 * Single source of truth for responsive layout classes.
 * Spec: design/DESIGN.md §2.5.
 *
 * Do NOT derive breakpoints from raw width checks (`width >= 768`) anywhere
 * else — import this hook (or the constants) instead, so every surface agrees
 * on when the layout changes.
 *
 * | Class    | Width      | Navigation             | Content                  |
 * |----------|------------|------------------------|--------------------------|
 * | compact  | < 640      | Bottom tab bar         | 1 col, 16px gutters      |
 * | medium   | 640–1023   | Icon+label rail (84px) | max 720 centered         |
 * | expanded | >= 1024    | Sidebar (264px)        | max 1120, 32px gutters   |
 */

export const BREAKPOINTS = {
  medium: 640,
  expanded: 1024,
} as const;

/** Layout chrome dimensions — derive scroll insets from these, never magic numbers. */
export const LAYOUT = {
  /** Bottom tab bar height, excluding safe-area inset. */
  tabBarHeight: 56,
  /** Tablet navigation rail width. */
  railWidth: 84,
  /** Desktop sidebar width. */
  sidebarWidth: 264,
  /** Max content width per class. */
  contentMaxWidth: { compact: undefined as number | undefined, medium: 720, expanded: 1120 },
  /** Horizontal screen padding per class. */
  gutter: { compact: 16, medium: 24, expanded: 32 },
  /** Form/dialog max widths. */
  formMaxWidth: { compact: undefined as number | undefined, medium: 560, expanded: 600 },
} as const;

export type Breakpoint = 'compact' | 'medium' | 'expanded';

export interface BreakpointInfo {
  breakpoint: Breakpoint;
  isCompact: boolean;
  isMedium: boolean;
  isExpanded: boolean;
  width: number;
  height: number;
  /** Max content width for the current class (undefined = full width). */
  contentMaxWidth: number | undefined;
  /** Horizontal screen padding for the current class. */
  gutter: number;
}

export const getBreakpoint = (width: number): Breakpoint => {
  if (width >= BREAKPOINTS.expanded) return 'expanded';
  if (width >= BREAKPOINTS.medium) return 'medium';
  return 'compact';
};

export const useBreakpoint = (): BreakpointInfo => {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const breakpoint = getBreakpoint(width);
    return {
      breakpoint,
      isCompact: breakpoint === 'compact',
      isMedium: breakpoint === 'medium',
      isExpanded: breakpoint === 'expanded',
      width,
      height,
      contentMaxWidth: LAYOUT.contentMaxWidth[breakpoint],
      gutter: LAYOUT.gutter[breakpoint],
    };
  }, [width, height]);
};
