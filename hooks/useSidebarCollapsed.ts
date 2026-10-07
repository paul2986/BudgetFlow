import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Whether the desktop sidebar is collapsed to its icon column. A device
 * preference, kept across sign-outs like the theme.
 * Web reads it synchronously (AsyncStorage on web is localStorage under the
 * same key), so a collapsed sidebar doesn't open and then shut on load.
 */

const STORAGE_KEY = 'sidebar_collapsed_v1';

const readSync = (): boolean | null => {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return null;
  }
};

export const useSidebarCollapsed = (): [boolean, (collapsed: boolean) => void] => {
  const [collapsed, setCollapsedState] = useState<boolean>(() => readSync() ?? false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => setCollapsedState(value === 'true'))
      .catch(() => {});
  }, []);

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    AsyncStorage.setItem(STORAGE_KEY, String(value)).catch(() => {});
  }, []);

  return [collapsed, setCollapsed];
};
