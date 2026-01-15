
import { useState, useEffect, useCallback } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import { Budget, BudgetLockSettings } from '../types/budget';
import { setBudgetLock, markBudgetUnlocked } from '../utils/storage';

export interface BudgetLockCapabilities {
  hasHardware: boolean;
  hasPasscode: boolean;
  canUseDevicePasscode: boolean;
}

export function useBudgetLock() {
  const [capabilities, setCapabilities] = useState<BudgetLockCapabilities>({
    hasHardware: false,
    hasPasscode: false,
    canUseDevicePasscode: false,
  });
  const [loading, setLoading] = useState(true);

  // Check device capabilities
  const checkCapabilities = useCallback(async (): Promise<BudgetLockCapabilities> => {
    try {
      console.log('useBudgetLock: Checking device capabilities');
      
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      console.log('useBudgetLock: Hardware available:', hasHardware);
      
      // Check if device has any form of authentication (biometrics or passcode)
      const securityLevel = await LocalAuthentication.getEnrolledLevelAsync();
      const hasPasscode = securityLevel !== LocalAuthentication.SecurityLevel.NONE;
      console.log('useBudgetLock: Security level:', securityLevel, 'Has passcode:', hasPasscode);
      
      // Can use device passcode if hardware is available (even without biometrics enrolled)
      const canUseDevicePasscode = hasHardware && hasPasscode;
      
      const caps: BudgetLockCapabilities = {
        hasHardware,
        hasPasscode,
        canUseDevicePasscode,
      };

      console.log('useBudgetLock: Final capabilities:', caps);
      setCapabilities(caps);
      
      return caps;
    } catch (error) {
      console.error('useBudgetLock: Error checking capabilities:', error);
      const fallbackCaps: BudgetLockCapabilities = {
        hasHardware: false,
        hasPasscode: false,
        canUseDevicePasscode: false,
      };
      setCapabilities(fallbackCaps);
      return fallbackCaps;
    }
  }, []);

  // Initialize capabilities
  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      await checkCapabilities();
      setLoading(false);
    };

    initialize();
  }, [checkCapabilities]);

  // Check if device can use passcode authentication
  const canUseDevicePasscode = useCallback((): boolean => {
    return capabilities.canUseDevicePasscode;
  }, [capabilities.canUseDevicePasscode]);

  // Authenticate for a specific budget
  const authenticateForBudget = useCallback(async (budgetId: string): Promise<boolean> => {
    try {
      console.log('useBudgetLock: Authenticating for budget:', budgetId);
      
      if (!capabilities.canUseDevicePasscode) {
        console.log('useBudgetLock: Device passcode not available');
        return false;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock this budget',
        fallbackLabel: 'Use Passcode',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false, // Allow passcode fallback
      });

      console.log('useBudgetLock: Authentication result:', result);

      if (result.success) {
        console.log('useBudgetLock: Authentication successful, marking budget unlocked');
        const unlockResult = await markBudgetUnlocked(budgetId);
        if (!unlockResult.success) {
          console.error('useBudgetLock: Failed to mark budget unlocked:', unlockResult.error);
        }
        return true;
      } else {
        console.log('useBudgetLock: Authentication failed:', result.error);
        return false;
      }
    } catch (error) {
      console.error('useBudgetLock: Authentication error:', error);
      return false;
    }
  }, [capabilities.canUseDevicePasscode]);

  // Check if budget should auto-lock based on timeout
  const shouldAutoLock = useCallback((lock: BudgetLockSettings): boolean => {
    if (lock.autoLockMinutes === 0) {
      // Immediate lock - always prompt
      return true;
    }

    if (!lock.lastUnlockAt) {
      // No unlock time recorded - should lock
      return true;
    }

    const lastUnlock = new Date(lock.lastUnlockAt);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastUnlock.getTime()) / (1000 * 60);
    
    const shouldLock = diffMinutes >= lock.autoLockMinutes;
    console.log('useBudgetLock: Auto-lock check:', {
      lastUnlock: lastUnlock.toISOString(),
      now: now.toISOString(),
      diffMinutes,
      autoLockMinutes: lock.autoLockMinutes,
      shouldLock,
    });
    
    return shouldLock;
  }, []);

  // Check if a budget is currently locked
  const isLocked = useCallback((budget: Budget): boolean => {
    if (!budget || !budget.lock || !budget.lock.locked) {
      return false;
    }

    return shouldAutoLock(budget.lock);
  }, [shouldAutoLock]);

  // Toggle budget lock
  const toggleBudgetLock = useCallback(async (budgetId: string, enabled: boolean): Promise<{ success: boolean; error?: Error }> => {
    console.log('useBudgetLock: Toggling budget lock:', budgetId, enabled);
    
    if (enabled && !capabilities.canUseDevicePasscode) {
      return { success: false, error: new Error('Device passcode is not available') };
    }

    const patch: Partial<BudgetLockSettings> = {
      locked: enabled,
      lastUnlockAt: enabled ? undefined : new Date().toISOString(),
    };

    return await setBudgetLock(budgetId, patch);
  }, [capabilities.canUseDevicePasscode]);

  // Set auto-lock timeout for a budget
  const setBudgetAutoLock = useCallback(async (budgetId: string, autoLockMinutes: number): Promise<{ success: boolean; error?: Error }> => {
    console.log('useBudgetLock: Setting auto-lock timeout:', budgetId, autoLockMinutes);
    
    const patch: Partial<BudgetLockSettings> = {
      autoLockMinutes,
    };

    return await setBudgetLock(budgetId, patch);
  }, []);

  // Lock budget immediately
  const lockBudgetNow = useCallback(async (budgetId: string): Promise<{ success: boolean; error?: Error }> => {
    console.log('useBudgetLock: Locking budget now:', budgetId);
    
    const patch: Partial<BudgetLockSettings> = {
      lastUnlockAt: undefined, // Clear unlock time to force lock
    };

    return await setBudgetLock(budgetId, patch);
  }, []);

  return {
    capabilities,
    loading,
    canUseDevicePasscode,
    authenticateForBudget,
    shouldAutoLock,
    isLocked,
    toggleBudgetLock,
    setBudgetAutoLock,
    lockBudgetNow,
    checkCapabilities,
  };
}
