import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { motion } from '../styles/tokens';

/**
 * Wraps what a lock screen gives way to. The moment `locked` goes false, whatever took
 * the lock's place fades in rather than appearing at full strength, which was harsh. It
 * only does this after an unlock: at any other time the wrapper adds nothing but a View, so
 * ordinary visits to a screen aren't slowed down. Under Reduce Motion the fade is a short one.
 *
 * The fade is a veil in the page colour laid over the content that fades out and is then
 * removed, not the content's own opacity going from 0 to 1. The first version animated the
 * content's opacity with the native driver and reset it to 0 once it finished; on the phone
 * that reset reached the native view before React had dropped the animated style, and the
 * budget faded in and then went blank. A veil has nothing to reset: it is simply unmounted.
 *
 * It has to stay mounted across the change (swap the lock screen and the content inside
 * it, not the wrapper), or it would never see the lock go.
 */
export default function UnlockFade({
  locked,
  children,
  style,
}: {
  locked: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { tokens } = useTheme();
  const reduceMotion = useReducedMotion();
  const veil = useRef(new Animated.Value(1)).current;
  const [fading, setFading] = useState(false);

  // Seeing the lock go is decided while rendering (not in an effect) so the veil is already
  // there in the first frame after an unlock, instead of the content showing and then being covered.
  const [wasLocked, setWasLocked] = useState(locked);
  if (locked !== wasLocked) {
    setWasLocked(locked);
    if (wasLocked && !locked) {
      veil.setValue(1); // not attached to anything yet: this only sets where the fade starts
      setFading(true);
    }
  }

  useEffect(() => {
    if (!fading) return;
    const animation = Animated.timing(veil, {
      toValue: 0,
      duration: reduceMotion ? motion.exit : motion.unlock,
      // Ease-out: the first moments already move, so the budget starts showing at once and settles,
      // instead of a beat of blank page before it appears.
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== 'web',
    });
    // `finished` is false when this effect is torn down mid-fade (Reduce Motion being read,
    // say): the fade then carries on from where it was rather than ending early.
    animation.start(({ finished }) => {
      if (finished) setFading(false);
    });
    return () => animation.stop();
  }, [fading, veil, reduceMotion]);

  return (
    <View style={style}>
      {children}
      {fading ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: tokens.colors.bg, opacity: veil }]}
        />
      ) : null}
    </View>
  );
}
