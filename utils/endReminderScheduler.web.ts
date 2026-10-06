import type { Budget } from '../types/budget';

/**
 * Web build of endReminderScheduler: the browser can't schedule a notification
 * for a time the page isn't open, so there are no end reminders here. The same
 * exports keep the callers platform-free.
 */

export type ReminderPermission = 'granted' | 'denied' | 'undetermined';

export const remindersSupported = false;

export const initReminders = (): void => {};
export const loadRemindersEnabled = async (): Promise<boolean> => false;
export const saveRemindersEnabled = async (_enabled: boolean): Promise<void> => {};
export const getReminderPermission = async (): Promise<ReminderPermission> => 'denied';
export const requestReminderPermission = async (): Promise<ReminderPermission> => 'denied';
export const clearEndReminders = async (): Promise<void> => {};
export const syncEndReminders = async (_budgets: Budget[], _now?: Date): Promise<void> => {};
