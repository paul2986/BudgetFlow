import React, { createContext, useEffect, useRef, useState } from 'react';
import { View, ViewStyle, Animated, Pressable, StyleSheet } from 'react-native';
import { useIsFocused } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';
import { useBreakpoint, LAYOUT, formsArePopups } from '../../hooks/useBreakpoint';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { radius, space, elevation, motion } from '../../styles/tokens';
import Portal from './Portal';

/**
 * Route-hosted form container (DESIGN.md §2.5 unified add/edit pattern).
 * - Compact: full screen.
 * - Medium+ on web: a pop-up, in a portal above the whole app (sidebar too).
 *   The screen it opened over stays in view (useEditorTransitions) behind a
 *   dimmed, blurred backdrop that fades in while the card rises; closing
 *   fades both out. Escape or a click on the backdrop does what the header's
 *   ✕ / ← does, so unsaved changes still ask first.
 * - Medium+ in the iPad app: a centred card in place of the screen.
 * Because it's a route (not an overlay), every form is deep-linkable and the
 * browser back button behaves identically on all platforms.
 */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface FormCard {
  /** The header's leading action (✕ / ←), registered by StandardHeader. */
  dismissRef: React.MutableRefObject<(() => void) | null>;
}

/** Set inside the medium+ form card, where a page-size title would overpower the dialog. */
export const FormCardContext = createContext<FormCard | null>(null);

interface FormScreenProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}

export default function FormScreen({ children, style }: FormScreenProps) {
  const { tokens } = useTheme();
  const bp = useBreakpoint();
  const popup = formsArePopups(bp.isCompact);
  const focused = useIsFocused();
  const reduceMotion = useReducedMotion();
  const dismissRef = useRef<(() => void) | null>(null);
  const card = useRef<FormCard>({ dismissRef }).current;
  const progress = useRef(new Animated.Value(0)).current;
  // Shown while focused and while fading out after. The screen (and so the
  // form's state) stays mounted between visits, as on every other layout.
  const [shown, setShown] = useState(popup && focused);

  useEffect(() => {
    if (!popup) return;
    if (focused) {
      setShown(true);
      if (reduceMotion) {
        progress.setValue(1);
        return;
      }
      progress.setValue(0);
      const enter = Animated.spring(progress, { toValue: 1, ...motion.spring, overshootClamping: true, useNativeDriver: false });
      enter.start();
      return () => enter.stop();
    }
    const exit = Animated.timing(progress, { toValue: 0, duration: reduceMotion ? 0 : motion.exit, useNativeDriver: false });
    exit.start(({ finished }) => {
      if (finished) setShown(false);
    });
    return () => exit.stop();
  }, [popup, focused, reduceMotion, progress]);

  useEffect(() => {
    if (!popup || !focused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissRef.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [popup, focused]);

  if (bp.isCompact) {
    return <View style={[{ flex: 1 }, style]}>{children}</View>;
  }

  const surface = {
    width: '100%' as const,
    maxWidth: LAYOUT.formMaxWidth[bp.breakpoint] ?? 600,
    backgroundColor: tokens.colors.surface,
    borderRadius: radius.xl,
    overflow: 'hidden' as const,
    // Fill, not stroke: soft lift in light mode, stepped surface in dark.
    ...(tokens.isDark ? { backgroundColor: tokens.colors.surfaceRaised } : popup ? elevation.e3 : elevation.e2),
  };

  if (popup) {
    return (
      <Portal>
        <View
          style={[
            {
              position: 'fixed' as any,
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
              padding: space.s9,
              display: shown ? 'flex' : 'none',
            },
            style,
          ]}
        >
          <AnimatedPressable
            onPress={() => dismissRef.current?.()}
            accessibilityLabel="Close"
            // @ts-ignore web-only: no tab stop (Escape and the header's ✕ cover it)
            tabIndex={-1}
            style={[
              StyleSheet.absoluteFill,
              {
                opacity: progress,
                backgroundColor: tokens.colors.overlay,
                // Web-only blur and plain cursor.
                ...({ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', cursor: 'default' } as object),
              },
            ]}
          />
          <Animated.View
            role="dialog"
            aria-modal
            style={[
              surface,
              {
                maxHeight: '100%',
                opacity: progress,
                transform: [
                  { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [space.s6, 0] }) },
                  { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
                ],
              },
            ]}
          >
            <FormCardContext.Provider value={card}>{children}</FormCardContext.Provider>
          </Animated.View>
        </View>
      </Portal>
    );
  }

  return (
    <View style={[{ flex: 1, alignItems: 'center', paddingTop: space.s7, paddingHorizontal: bp.gutter }, style]}>
      <View style={[surface, { flex: 1, marginBottom: space.s7 }]}>
        <FormCardContext.Provider value={card}>{children}</FormCardContext.Provider>
      </View>
    </View>
  );
}
