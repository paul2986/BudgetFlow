import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  type ReminderPermission,
  getReminderPermission,
  loadRemindersEnabled,
  remindersSupported,
  requestReminderPermission,
  saveRemindersEnabled,
} from '../utils/endReminderScheduler';

/**
 * The device's "remind me when an expense is about to end" setting, shared by
 * Settings, the dashboard and the sync that schedules the reminders. Whether
 * it's on is kept on this device (each phone asks for its own permission);
 * the permission itself is iOS's.
 */

interface State {
  loaded: boolean;
  enabled: boolean;
  permission: ReminderPermission;
}

let state: State = { loaded: false, enabled: false, permission: 'undetermined' };
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

const update = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Re-reads the setting and iOS's permission; the permission can change behind the app's back, in iOS Settings. */
export const refreshEndReminders = async (): Promise<void> => {
  const [enabled, permission] = await Promise.all([loadRemindersEnabled(), getReminderPermission()]);
  update({ loaded: true, enabled, permission });
};

export type TurnOnResult = 'on' | 'off' | 'blocked';

export const useEndReminders = () => {
  const current = useSyncExternalStore(subscribe, () => state);

  useEffect(() => {
    if (!remindersSupported || loading) return;
    loading = refreshEndReminders().finally(() => {
      loading = null;
    });
  }, []);

  /** Turning on asks iOS for permission the first time; 'blocked' means it was refused (so the switch stays off). */
  const setEnabled = useCallback(async (next: boolean): Promise<TurnOnResult> => {
    if (!next) {
      await saveRemindersEnabled(false);
      update({ enabled: false });
      return 'off';
    }
    let permission = await getReminderPermission();
    if (permission === 'undetermined') permission = await requestReminderPermission();
    update({ permission });
    if (permission !== 'granted') return 'blocked';
    await saveRemindersEnabled(true);
    update({ enabled: true });
    return 'on';
  }, []);

  return { supported: remindersSupported, ...current, setEnabled };
};
