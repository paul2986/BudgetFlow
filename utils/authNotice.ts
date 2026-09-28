import { Platform } from 'react-native';

/**
 * A one-off message for the signed-out screen, set just before signing out
 * (e.g. after deleting an account) and shown once by AuthGuard. Web reloads
 * the page on sign-out, so the notice is kept in sessionStorage to survive
 * that; native keeps it in memory.
 */
export type AuthNotice = 'account-deleted';

const STORAGE_KEY = 'budgetflow.authNotice';
let pending: AuthNotice | null = null;

export const setAuthNotice = (notice: AuthNotice) => {
    pending = notice;
    if (Platform.OS === 'web') {
        try {
            sessionStorage.setItem(STORAGE_KEY, notice);
        } catch {
            // Storage unavailable (e.g. private mode): the notice is skipped.
        }
    }
};

/** Returns the pending notice, if any, and clears it. */
export const consumeAuthNotice = (): AuthNotice | null => {
    let notice = pending;
    pending = null;
    if (Platform.OS === 'web') {
        try {
            notice = notice ?? (sessionStorage.getItem(STORAGE_KEY) as AuthNotice | null);
            sessionStorage.removeItem(STORAGE_KEY);
        } catch {
            // Storage unavailable: fall back to the in-memory value.
        }
    }
    return notice;
};
