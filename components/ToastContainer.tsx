import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from './Toast';
import { ToastMessage } from '../hooks/useToast';
import { LAYOUT } from '../hooks/useBreakpoint';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onHideToast: (id: string) => void;
}

/**
 * Toasts render at the bottom, above the tab bar (DESIGN.md §2.8), and never
 * steal focus.
 */
export default function ToastContainer({ toasts, onHideToast }: ToastContainerProps) {
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  const baseOffset = LAYOUT.tabBarHeight + insets.bottom + 16;

  return (
    <View style={styles.container}>
      {toasts.map((toast, index) => (
        <View key={toast.id} style={[styles.toastWrapper, { bottom: baseOffset + index * 68 }]}>
          <Toast
            message={toast.message}
            type={toast.type}
            visible={true}
            onHide={() => onHideToast(toast.id)}
            duration={toast.duration}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1100,
    pointerEvents: 'none',
  },
  toastWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    pointerEvents: 'auto',
  },
});
