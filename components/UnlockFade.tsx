import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleProp, ViewStyle } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { motion } from '../styles/tokens';

/**
 * Wraps what a lock screen gives way to. While `locked` it is invisible to the eye (it
 * holds the lock screen itself, at full strength); the moment `locked` goes false, whatever
 * took its place fades in rather than appearing at full strength, which was harsh. It only
 * fades after an unlock: the wrapper is a plain pass-through at any other time, so ordinary
 * visits to a screen aren't slowed down. Under Reduce Motion the fade is a short one.
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
  const reduceMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const [fading, setFading] = useState(false);

  // Seeing the lock go is decided while rendering (not in an effect) so the first frame after
  // an unlock is already transparent, instead of flashing the content and then hiding it.
  const [wasLocked, setWasLocked] = useState(locked);
  if (locked !== wasLocked) {
    setWasLocked(locked);
    if (wasLocked && !locked) setFading(true);
  }

  useEffect(() => {
    if (!fading) return;
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration: reduceMotion ? motion.exit : motion.theme,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start(() => {
      setFading(false);
      opacity.setValue(0);
    });
    return () => animation.stop();
  }, [fading, opacity, reduceMotion]);

  return <Animated.View style={[style, fading ? { opacity } : null]}>{children}</Animated.View>;
}
