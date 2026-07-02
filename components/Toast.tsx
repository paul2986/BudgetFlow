
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import Icon from './Icon';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  visible: boolean;
  onHide: () => void;
  duration?: number;
}

export default function Toast({ message, type, visible, onHide, duration = 4000 }: ToastProps) {
  const { currentColors, tokens } = useTheme();
  const [fadeAnim] = useState(new Animated.Value(0));
  // Toasts live at the bottom (above the tab bar) and slide up into place.
  const [slideAnim] = useState(new Animated.Value(40));

  const hideToast = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 40,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onHide();
    });
  }, [fadeAnim, slideAnim, onHide]);

  useEffect(() => {
    if (visible) {
      // Show animation
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto hide after duration
      const timer = setTimeout(() => {
        hideToast();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible, duration, fadeAnim, slideAnim, hideToast]);

  if (!visible) return null;

  // Calm Ledger toast (DESIGN.md §2.8): surface card, severity carried by the
  // icon color + shape, not a colored background.
  const getSeverityColor = () => {
    switch (type) {
      case 'success':
        return tokens.colors.income;
      case 'error':
        return tokens.colors.danger;
      case 'info':
      default:
        return tokens.colors.brand;
    }
  };

  const getIconName = () => {
    switch (type) {
      case 'success':
        return 'checkmark-circle';
      case 'error':
        return 'alert-circle';
      case 'info':
      default:
        return 'information-circle';
    }
  };

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
          backgroundColor: tokens.colors.surfaceRaised,
          borderColor: tokens.colors.border,
        },
      ]}
    >
      <Icon name={getIconName()} size={20} style={{ color: getSeverityColor(), marginRight: 8 }} />
      <Text style={[styles.message, { color: tokens.colors.text }]}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: '100%',
    maxWidth: 480,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 6,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  message: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
});
