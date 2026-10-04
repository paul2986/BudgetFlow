import { useMemo } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from '../styles/tokens';

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

/**
 * True in an iOS Safari tab (navigator.standalone exists only on iOS and is
 * false outside the home-screen app). There, position: fixed; bottom
 * resolves to the visible page bottom just above Safari's floating toolbar,
 * so bottom UI (tab bar, toasts) is pinned with fixed rather than offset
 * from the taller shell.
 */
export const IS_IOS_SAFARI_TAB =
  Platform.OS === 'web' &&
  typeof navigator !== 'undefined' &&
  (navigator as any).standalone === false;

/**
 * Min height for a scroller's content, so a short page still springs on iOS
 * web. Native scrollers always rubber-band, but Safari only springs a
 * scroller whose content overflows it, and a page that fills the screen
 * exactly (minHeight 100%) does not. One pixel more gives it something to
 * pull against. Undefined elsewhere (native, desktop, Android), where it
 * would only add a scrollbar or change nothing.
 */
export const BOUNCE_MIN_HEIGHT =
  Platform.OS === 'web' && typeof navigator !== 'undefined' && typeof (navigator as any).standalone === 'boolean'
    ? ('calc(100% + 1px)' as unknown as '100%')
    : undefined;

/**
 * Bottom safe-area inset to pad against. In an iOS Safari tab
 * env(safe-area-inset-bottom) reports the band hidden behind the floating
 * toolbar (measured 121pt), which UI pinned to the visible page already
 * clears, so it counts as 0 there; the toolbar band is handled by
 * bottomClearance() for shell-anchored UI.
 */
export function useBottomInset(): number {
  const insets = useSafeAreaInsets();
  return IS_IOS_SAFARI_TAB ? 0 : insets.bottom;
}

/**
 * In an iOS 26+ Safari tab the web shell extends below the visible page by
 * --toolbar-overhang (index.html) so content paints behind Safari's floating
 * toolbar down to the screen edge. Anything anchored to the shell's bottom
 * edge must lift back above that band: this adds it to a bottom
 * offset/inset. The overhang is 0 everywhere else (home-screen apps,
 * desktop, Android).
 */
export function bottomClearance(px: number): number {
  return Platform.OS === 'web'
    ? (`calc(${px}px + var(--toolbar-overhang, 0px))` as unknown as number)
    : px;
}

/**
 * Web: height of the status-bar band at the top of the compact shell (the
 * safe-area inset, plus the iOS home-screen app's --status-gap, index.html).
 * A CSS value, so only for web styles.
 */
export const STATUS_BAND = 'calc(env(safe-area-inset-top) + var(--status-gap, 0px))' as unknown as number;

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

/**
 * Gap between the floating tab bar and the shell bottom: it sits inside the
 * home-indicator zone, and devices without an inset get a small float gap.
 */
export const tabBarBottomOffset = (bottomInset: number): number =>
  Math.max(bottomInset - space.s3, space.s3);

/**
 * Bottom padding for a scroll view so its last control scrolls clear of the
 * floating tab bar (compact only; medium+ has no bar, just a comfortable end).
 */
export const useScrollBottomPadding = (gap: number = space.s6): number => {
  const { isCompact } = useBreakpoint();
  const bottomInset = useBottomInset();
  return bottomClearance(
    isCompact ? tabBarBottomOffset(bottomInset) + LAYOUT.tabBarHeight + gap : space.s10
  );
};
