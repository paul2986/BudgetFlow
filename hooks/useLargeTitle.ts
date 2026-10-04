import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useBreakpoint } from './useBreakpoint';
import { type } from '../styles/tokens';

/**
 * iOS large-title header state for a tab root screen (compact only).
 *
 * At rest the bar is bare (page bg, no stroke) and its title is large, level
 * with the bar's buttons. As the content scrolls, the title shrinks in place
 * to the bar's size and the bar's surface fill and hairline appear as it
 * lands, giving the standard header. Medium+ layouts
 * keep the standard header throughout (the rail/sidebar already name the
 * screen).
 *
 * Wire it up: pass the result to `StandardHeader` (`largeTitle`), put
 * `<LargeTitle>` first in the scroll content (it reserves the subtitle's
 * space), render the scroller as `Animated.ScrollView` and spread
 * `scrollProps` on it (it sets the scroller's style too).
 */
export interface LargeTitleGeometry {
  /** Scroll distance over which the title shrinks into the bar. */
  collapseDistance: number;
  /** Content room for what hangs below the bar at rest (the subtitle). */
  spacerHeight: number;
}

export interface LargeTitleState extends LargeTitleGeometry {
  enabled: boolean;
  /** Content offset of the screen's scroller. */
  scrollY: Animated.Value;
  /** The header reports its geometry (it depends on the bar's height). */
  setGeometry: (g: LargeTitleGeometry) => void;
  scrollProps: {
    ref: React.RefObject<ScrollView | null>;
    style: StyleProp<ViewStyle>;
    onScroll: (...args: any[]) => void;
    scrollEventThrottle: number;
    onScrollEndDrag?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
    onMomentumScrollEnd?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  };
}

const SCROLL_STYLE: StyleProp<ViewStyle> = { flex: 1 };

export function useLargeTitle(): LargeTitleState {
  const { isCompact } = useBreakpoint();
  const scrollY = useRef(new Animated.Value(0)).current;
  const ref = useRef<ScrollView | null>(null);
  const [geometry, setGeometryState] = useState<LargeTitleGeometry>({
    collapseDistance: type.display.lineHeight,
    spacerHeight: type.display.lineHeight,
  });

  const setGeometry = useCallback((g: LargeTitleGeometry) => {
    setGeometryState((prev) =>
      prev.collapseDistance === g.collapseDistance && prev.spacerHeight === g.spacerHeight ? prev : g
    );
  }, []);

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        // Opacity/transform only, so native runs it on the UI thread.
        useNativeDriver: Platform.OS !== 'web',
      }),
    [scrollY]
  );

  // Like UINavigationBar, never rest half-collapsed: a scroll that ends
  // inside the hand-over settles to whichever end is nearer. Native only;
  // web has no drag/momentum end events.
  const { collapseDistance } = geometry;
  const settle = useCallback(
    (y: number) => {
      if (y <= 0 || y >= collapseDistance) return;
      ref.current?.scrollTo({ y: y < collapseDistance / 2 ? 0 : collapseDistance, animated: true });
    },
    [collapseDistance]
  );

  const nativeSettle =
    Platform.OS === 'web' || !isCompact
      ? {}
      : {
          onScrollEndDrag: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
            // A flick continues as momentum; settle when that ends instead.
            if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.1) settle(e.nativeEvent.contentOffset.y);
          },
          onMomentumScrollEnd: (e: NativeSyntheticEvent<NativeScrollEvent>) =>
            settle(e.nativeEvent.contentOffset.y),
        };

  return {
    enabled: isCompact,
    scrollY,
    ...geometry,
    setGeometry,
    scrollProps: {
      ref,
      // Left to rubber-band like every other scroller. The header stays put
      // (the interpolations in StandardHeader clamp at 0) while the page
      // springs beneath it, as on the screens with a plain header.
      style: SCROLL_STYLE,
      onScroll,
      scrollEventThrottle: 16,
      ...nativeSettle,
    },
  };
}
