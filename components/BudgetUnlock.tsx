import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../hooks/useToast';
import { useBudgetData } from '../hooks/useBudgetData';
import { useBudgetLock } from '../hooks/useBudgetLock';
import { describeWait, waitSeconds } from '../utils/budgetLock';
import { getLockAttempts } from '../utils/storage';
import { haptics } from '../utils/haptics';
import type { Budget } from '../types/budget';
import Button from './Button';
import Icon from './Icon';
import { Input, PinPad, Sheet } from './ui';
import { radius, space, type } from '../styles/tokens';

/**
 * What a locked budget shows in place of itself: the code pad, with Face ID or
 * Touch ID as a quicker way in where this device has it turned on for the budget.
 * Opening it needs nothing from the caller (the budget unlocks, and whatever was
 * showing this renders the budget). `onUnlocked` is for a caller that wants to know.
 */

interface BudgetUnlockProps {
  budget: Budget;
  title?: string;
  caption?: string;
  /** "Switch budget" is the way out of a locked one; leave it off where the screen has its own. */
  showSwitch?: boolean;
  /** Ask for Face ID / Touch ID as soon as this appears, where it is turned on. */
  autoBiometric?: boolean;
  onUnlocked?: () => void;
}

export default function BudgetUnlock({ budget, title, caption, showSwitch = true, autoBiometric = true, onUnlocked }: BudgetUnlockProps) {
  const { tokens } = useTheme();
  const { showToast } = useToast();
  const { user } = useBudgetData();
  const { biometric, checkCode, unlockWithBiometrics, resetLockWithPassword } = useBudgetLock();
  // Tabs stay mounted once visited, so several can be showing a lock at once; only the one in view asks for Face ID.
  const focused = useIsFocused();

  const [message, setMessage] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [forgotOpen, setForgotOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [forgotError, setForgotError] = useState<string | undefined>();
  const [resetting, setResetting] = useState(false);

  const waiting = waitSeconds({ failures: 0, blockedUntil }, now);
  const useBiometrics = !!biometric && !!budget.lock?.biometrics;

  // A wait carried over from before the app was closed.
  useEffect(() => {
    let cancelled = false;
    getLockAttempts(budget.id).then((attempts) => {
      if (!cancelled && attempts.blockedUntil > Date.now()) setBlockedUntil(attempts.blockedUntil);
    });
    return () => {
      cancelled = true;
    };
  }, [budget.id]);

  // Count the wait down.
  useEffect(() => {
    if (blockedUntil <= Date.now()) return;
    setNow(Date.now());
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= blockedUntil) {
        clearInterval(timer);
        setMessage(null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [blockedUntil]);

  const handleCode = useCallback(
    async (pin: string) => {
      const check = await checkCode(budget.id, pin);
      if (check.ok) {
        setMessage(null);
        haptics.success();
        onUnlocked?.();
        return;
      }
      haptics.error();
      setShakeKey((k) => k + 1);
      if (check.reason === 'wait') {
        setBlockedUntil(Date.now() + check.seconds * 1000);
        setMessage('Too many wrong codes.');
      } else {
        setMessage(
          check.triesLeft !== null && check.triesLeft <= 2
            ? `That code isn’t right. ${check.triesLeft} ${check.triesLeft === 1 ? 'try' : 'tries'} left before a short wait.`
            : 'That code isn’t right.'
        );
      }
    },
    [budget.id, checkCode, onUnlocked]
  );

  const handleBiometrics = useCallback(async () => {
    if (await unlockWithBiometrics(budget)) {
      haptics.success();
      onUnlocked?.();
    }
  }, [budget, unlockWithBiometrics, onUnlocked]);

  // Face ID as soon as the lock is showing and the app is in front, once per appearance: a cancelled
  // attempt leaves the pad to be used. With "immediately" the lock appears as the app is left, so
  // the ask has to wait for the way back rather than be dropped because the app wasn't active yet.
  const prompted = useRef(false);
  const askRef = useRef(handleBiometrics);
  askRef.current = handleBiometrics;
  useEffect(() => {
    if (!autoBiometric || !useBiometrics || !focused) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      if (prompted.current || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (prompted.current || AppState.currentState !== 'active') return;
        prompted.current = true;
        askRef.current();
      }, 400);
    };
    if (AppState.currentState === 'active') start();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [autoBiometric, useBiometrics, focused]);

  const closeForgot = () => {
    setForgotOpen(false);
    setPassword('');
    setForgotError(undefined);
  };

  const handleForgot = async () => {
    if (!password) {
      setForgotError('Enter your password.');
      return;
    }
    if (!user?.email) {
      setForgotError('Sign in again to do this.');
      return;
    }
    setResetting(true);
    setForgotError(undefined);
    try {
      const result = await resetLockWithPassword(budget.id, user.email, password);
      if (result.ok) {
        closeForgot();
        haptics.success();
        showToast('Lock turned off. Turn it on again in Budget lock to choose a new code.', 'success', 6000);
      } else {
        setForgotError(result.message);
      }
    } finally {
      setResetting(false);
    }
  };

  const status = waiting > 0 ? `Too many wrong codes. Try again in ${describeWait(waiting)}.` : message;

  return (
    <View style={{ alignItems: 'center', width: '100%' }}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: radius.full,
          backgroundColor: tokens.colors.brandSubtle,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: space.s3,
        }}
      >
        <Icon name="lock-closed" size={22} color={tokens.colors.brand} />
      </View>
      <Text accessibilityRole="header" style={[type.h3, { color: tokens.colors.text, textAlign: 'center' }]}>
        {title ?? `${budget.name} is locked`}
      </Text>
      <Text style={[type.body, { color: tokens.colors.textMuted, textAlign: 'center', marginTop: space.s1 }]}>
        {caption ?? 'Enter your 4-digit code to open it.'}
      </Text>

      <PinPad
        onComplete={handleCode}
        disabled={waiting > 0 || forgotOpen}
        error={!!status}
        shakeKey={shakeKey}
        extraKey={
          useBiometrics
            ? {
                icon: biometric === 'Face ID' ? 'scan-outline' : 'finger-print',
                label: `Unlock with ${biometric}`,
                onPress: handleBiometrics,
              }
            : undefined
        }
      />

      {/* Always the same height, so the pad doesn't move when a message appears. */}
      <View style={{ minHeight: 36, justifyContent: 'center' }} accessibilityLiveRegion="polite">
        {status ? <Text style={[type.caption, { color: tokens.colors.danger, textAlign: 'center' }]}>{status}</Text> : null}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', columnGap: space.s2 }}>
        <Button text="Forgot code?" variant="ghost" onPress={() => setForgotOpen(true)} />
        {showSwitch ? <Button text="Switch budget" variant="ghost" onPress={() => router.push('/budgets')} /> : null}
      </View>

      <Sheet
        visible={forgotOpen}
        onClose={closeForgot}
        title="Forgot your code?"
        leadingAction={{ label: 'Cancel', onPress: closeForgot, disabled: resetting }}
        footer={<Button text="Turn off lock" onPress={handleForgot} loading={resetting} disabled={!password} />}
      >
        <View style={{ padding: space.s5, gap: space.s4 }}>
          <Text style={[type.body, { color: tokens.colors.textMuted }]}>
            Enter your account password to turn the lock off on all your devices. You can lock the budget again with a new code afterwards.
          </Text>
          <Input
            label="Account password"
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setForgotError(undefined);
            }}
            error={forgotError}
            password
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={handleForgot}
          />
        </View>
      </Sheet>
    </View>
  );
}
