
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Toast from './Toast';
import { ToastMessage } from '../hooks/useToast';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onHideToast: (id: string) => void;
}

export default function ToastContainer({ toasts, onHideToast }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <View style={styles.container}>
      {toasts.map((toast, index) => (
        <View key={toast.id} style={[styles.toastWrapper, { top: 60 + (index * 70) }]}>
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
    left: 0,
    right: 0,
    zIndex: 1000,
    pointerEvents: 'none',
  },
  toastWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    pointerEvents: 'auto',
  },
});
