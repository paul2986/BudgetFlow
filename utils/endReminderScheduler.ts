import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import type { Budget } from '../types/budget';
import { REMINDER_ID_PREFIX, planEndReminders } from './endReminders';

/**
 * Hands the planned end-of-expense reminders to iOS (and Android) as local
 * notifications. They are scheduled on the phone itself, not pushed from a
 * server, so they need no Apple push entitlement and arrive offline. The cost
 * is that they are only as fresh as the last time the app was open: a change
 * made on another device reaches this phone's reminders when the app next syncs.
 */

export type ReminderPermission = 'granted' | 'denied' | 'undetermined';

/** False where the platform can't schedule notifications (the web build has its own no-op version of this file). */
export const remindersSupported = Platform.OS !== 'web';

const ENABLED_KEY = 'end_reminders_enabled_v1';
const ANDROID_CHANNEL = 'expense-end';

export const initReminders = (): void => {
  // Without a handler a notification that arrives while the app is open is dropped.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: 'Ending expenses',
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => {});
  }
};

export const loadRemindersEnabled = async (): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) === 'true';
  } catch {
    return false;
  }
};

export const saveRemindersEnabled = async (enabled: boolean): Promise<void> => {
  try {
    await AsyncStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
  } catch (error) {
    console.error('endReminderScheduler: could not save the setting', error);
  }
};

const toPermission = (p: Notifications.NotificationPermissionsStatus): ReminderPermission =>
  p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';

export const getReminderPermission = async (): Promise<ReminderPermission> => {
  try {
    return toPermission(await Notifications.getPermissionsAsync());
  } catch {
    return 'denied';
  }
};

/** Shows iOS's one-time permission prompt (a no-op returning the answer once it has been given). */
export const requestReminderPermission = async (): Promise<ReminderPermission> => {
  try {
    return toPermission(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true } }));
  } catch {
    return 'denied';
  }
};

const pendingOurs = async (): Promise<string[]> =>
  (await Notifications.getAllScheduledNotificationsAsync())
    .map((n) => n.identifier)
    .filter((id) => id.startsWith(REMINDER_ID_PREFIX));

// One sync at a time: two overlapping ones would each cancel and reschedule the other's work.
let queue: Promise<void> = Promise.resolve();
let lastSignature: string | null = null;

const enqueue = (job: () => Promise<void>): Promise<void> => {
  queue = queue.then(job, job).catch((error) => console.error('endReminderScheduler: sync failed', error));
  return queue;
};

/** Cancels every reminder this app scheduled. */
export const clearEndReminders = (): Promise<void> =>
  enqueue(async () => {
    await Promise.all((await pendingOurs()).map((id) => Notifications.cancelScheduledNotificationAsync(id)));
    lastSignature = '[]';
  });

/**
 * Makes the phone's pending reminders match the budgets. A no-op while the
 * plan hasn't changed and the phone still holds all of it.
 */
export const syncEndReminders = (budgets: Budget[], now: Date = new Date()): Promise<void> =>
  enqueue(async () => {
    const plan = planEndReminders(budgets, now);
    const signature = JSON.stringify(
      plan.map((r) => [r.id, r.fireAt.getTime(), r.title, r.subtitle ?? '', r.body])
    );
    const pending = await pendingOurs();
    if (signature === lastSignature && pending.length === plan.length) return;

    await Promise.all(pending.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
    let scheduledAll = true;
    for (const r of plan) {
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: r.id,
          content: {
            title: r.title,
            subtitle: r.subtitle,
            body: r.body,
            data: { budgetId: r.budgetId, expenseId: r.expenseId },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: r.fireAt,
            channelId: ANDROID_CHANNEL,
          },
        });
      } catch (error) {
        scheduledAll = false;
        console.error('endReminderScheduler: could not schedule', r.id, error);
      }
    }
    // Leave the signature unset after a failure so the next sync tries again.
    lastSignature = scheduledAll ? signature : null;
  });
