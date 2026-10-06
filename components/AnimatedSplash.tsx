import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { motion } from '../styles/tokens';
import { useReducedMotion } from '../hooks/useReducedMotion';

/**
 * Launch animation. The native launch screen is static, so this draws the
 * same picture in JS (gradient image behind a white B), takes over from it
 * once both images are on screen, and then, when the app is ready, zooms the
 * B toward you while the gradient dissolves into the app.
 *
 * Only the first beat is shared with the native screen: it is built from the
 * same two assets (assets/images/splash-*.png, made by
 * scripts/generate-splash-assets.py) at the same size and position, so the
 * hand-off can't be seen. Reduced motion replaces the zoom with a short fade
 * (DESIGN.md §2.4).
 */

/** Matches `imageWidth` for expo-splash-screen in app.config.ts. */
const LOGO_SIZE = 144;

// Shown behind the images until they load; matches the plugin's fallback.
const FALLBACK_COLOR = '#3B3BD0';

// Give up waiting for the images and reveal the app anyway.
const HAND_OFF_TIMEOUT_MS = 1500;

const BACKGROUND = require('../assets/images/splash-background.png');
const MARK = require('../assets/images/splash-mark.png');

interface AnimatedSplashProps {
  /** The app can be shown underneath (fonts are loaded). */
  ready: boolean;
  /** The overlay has finished and can be unmounted. */
  onDone: () => void;
}

export default function AnimatedSplash({ ready, onDone }: AnimatedSplashProps) {
  const reduceMotion = useReducedMotion();

  const opacity = useRef(new Animated.Value(1)).current;
  const markOpacity = useRef(new Animated.Value(1)).current;
  const markScale = useRef(new Animated.Value(1)).current;

  const loaded = useRef({ background: false, mark: false });
  const [handedOff, setHandedOff] = useState(false);
  const exiting = useRef(false);

  // Take over from the native screen: wait until both images are drawn, plus a
  // frame, so there is no gap where neither is showing.
  const handOff = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        SplashScreen.hideAsync().catch(() => {});
        setHandedOff(true);
      });
    });
  }, []);

  const imageLoaded = (which: 'background' | 'mark') => () => {
    loaded.current[which] = true;
    if (loaded.current.background && loaded.current.mark) handOff();
  };

  useEffect(() => {
    const timer = setTimeout(handOff, HAND_OFF_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [handOff]);

  useEffect(() => {
    if (!ready || !handedOff || exiting.current) return;
    exiting.current = true;

    const animation = reduceMotion
      ? Animated.timing(opacity, { toValue: 0, duration: motion.exit, useNativeDriver: true })
      : Animated.sequence([
          // A small breath in before the zoom, like a button taking a press.
          Animated.timing(markScale, {
            toValue: 0.94,
            duration: 140,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.parallel([
            Animated.timing(markScale, {
              toValue: 2.2,
              duration: 460,
              easing: Easing.in(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(markOpacity, {
              toValue: 0,
              duration: 300,
              delay: 160,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 340,
              delay: 140,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ]);
    animation.start(onDone);
  }, [ready, handedOff, reduceMotion, opacity, markOpacity, markScale, onDone]);

  return (
    <Animated.View
      // Nothing underneath is usable until the app is ready; after that the
      // fade must not swallow the first taps.
      pointerEvents={ready && handedOff ? 'none' : 'auto'}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.root, { opacity }]}
    >
      <Image
        source={BACKGROUND}
        resizeMode="cover"
        fadeDuration={0}
        style={StyleSheet.absoluteFill}
        onLoadEnd={imageLoaded('background')}
      />
      <Animated.Image
        source={MARK}
        resizeMode="contain"
        fadeDuration={0}
        style={{
          width: LOGO_SIZE,
          height: LOGO_SIZE,
          opacity: markOpacity,
          transform: [{ scale: markScale }],
        }}
        onLoadEnd={imageLoaded('mark')}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FALLBACK_COLOR,
  },
});
