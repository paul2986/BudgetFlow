import { View, StyleSheet } from 'react-native';
import Toast from './Toast';
import { ToastMessage } from '../hooks/useToast';
import { LAYOUT, bottomClearance, IS_IOS_SAFARI_TAB, useBottomInset } from '../hooks/useBreakpoint';
import { space } from '../styles/tokens';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onHideToast: (id: string) => void;
}

/**
 * Toasts render at the bottom, above the tab bar (DESIGN.md §2.8), and never
 * steal focus.
 */
export default function ToastContainer({ toasts, onHideToast }: ToastContainerProps) {
  const bottomInset = useBottomInset();

  if (toasts.length === 0) return null;

  const baseOffset = LAYOUT.tabBarHeight + bottomInset + space.s4;

  return (
    <View style={[styles.container, IS_IOS_SAFARI_TAB && { position: 'fixed' as any }]}>
      {toasts.map((toast, index) => (
        <View key={toast.id} style={[styles.toastWrapper, { bottom: IS_IOS_SAFARI_TAB ? baseOffset + index * 68 : bottomClearance(baseOffset + index * 68) }]}>
          <Toast
            message={toast.message}
            type={toast.type}
            visible={true}
            onHide={() => onHideToast(toast.id)}
            duration={toast.duration}
            action={toast.action}
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
    paddingHorizontal: space.s4,
    pointerEvents: 'auto',
  },
});
