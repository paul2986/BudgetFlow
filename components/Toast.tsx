import { useEffect, useRef, useCallback } from 'react';
import { Text, Animated, Pressable } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useReducedMotion } from '../hooks/useReducedMotion';
import Icon from './Icon';
import { type, space, radius, elevation, motion } from '../styles/tokens';
import type { ToastAction } from '../hooks/useToast';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  visible: boolean;
  onHide: () => void;
  duration?: number;
  action?: ToastAction;
}

/**
 * Calm Ledger toast (DESIGN.md §2.8): raised surface, severity carried by
 * icon color + shape, never a colored background.
 * Motion: springs up from the bottom edge and leaves the same way (spatial
 * consistency); a plain cross-fade under Reduce Motion. Tap to dismiss early.
 */
export default function Toast({ message, type: kind, visible, onHide, duration = 4000, action }: ToastProps) {
  const { tokens } = useTheme();
  const reduceMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(reduceMotion ? 0 : space.s8)).current;
  const hiding = useRef(false);

  const hideToast = useCallback(() => {
    if (hiding.current) return;
    hiding.current = true;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: motion.exit, useNativeDriver: true }),
      reduceMotion
        ? Animated.delay(0)
        : Animated.timing(translateY, { toValue: space.s8, duration: motion.exit, useNativeDriver: true }),
    ]).start(() => onHide());
  }, [opacity, translateY, reduceMotion, onHide]);

  useEffect(() => {
    if (!visible) return;
    hiding.current = false;
    // Reduce Motion can resolve after first render; never leave the toast offset.
    if (reduceMotion) translateY.setValue(0);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: reduceMotion ? motion.fast : motion.base,
        useNativeDriver: true,
      }),
      reduceMotion
        ? Animated.delay(0)
        : Animated.spring(translateY, { toValue: 0, ...motion.spring, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(hideToast, duration);
    return () => clearTimeout(timer);
  }, [visible, duration, opacity, translateY, reduceMotion, hideToast]);

  if (!visible) return null;

  const severity =
    kind === 'success'
      ? { color: tokens.colors.income, icon: 'checkmark-circle' }
      : kind === 'error'
        ? { color: tokens.colors.danger, icon: 'alert-circle' }
        : { color: tokens.colors.brand, icon: 'information-circle' };

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={{
        width: '100%',
        maxWidth: 480,
        opacity,
        transform: [{ translateY }],
      }}
    >
      <Pressable
        onPress={hideToast}
        accessibilityRole="alert"
        accessibilityHint="Dismisses this message"
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: space.s4,
          paddingVertical: space.s3,
          borderRadius: radius.md,
          backgroundColor: pressed ? tokens.colors.surfaceSunken : tokens.colors.surfaceRaised,
          borderWidth: tokens.isDark ? 1 : 0,
          borderColor: tokens.colors.border,
          ...elevation.e2,
        })}
      >
        <Icon name={severity.icon as any} size={20} style={{ color: severity.color, marginRight: space.s2 }} />
        <Text style={[type.bodyMed, { color: tokens.colors.text, flex: 1 }]}>{message}</Text>
        {action ? (
          <Pressable
            onPress={() => {
              action.onPress();
              hideToast();
            }}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            style={({ pressed }) => ({
              minHeight: 44,
              justifyContent: 'center',
              marginLeft: space.s3,
              marginRight: -space.s1,
              paddingHorizontal: space.s2,
              opacity: pressed ? 0.5 : 1,
            })}
          >
            <Text style={[type.bodyMed, { color: tokens.colors.brand }]}>{action.label}</Text>
          </Pressable>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}
