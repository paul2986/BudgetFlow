import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// Sparing by design (Apple HIG): selection ticks, outcome notifications, and
// destructive warnings only — never on every button press.
const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

const fire = (run: () => Promise<void>) => {
  if (!enabled) return;
  run().catch(() => {});
};

export const haptics = {
  selection: () => fire(() => Haptics.selectionAsync()),
  success: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  error: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  warning: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
