import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, Text, View } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { PIN_LENGTH } from '../../utils/budgetLock';
import Icon from '../Icon';
import { radius, space, tabularNums, type } from '../../styles/tokens';

/**
 * A four-digit code entry: dots that fill as digits go in, and a keypad under
 * them (a keyboard works too, on the web). When the last digit is entered the code
 * goes to `onComplete`; the dots clear once it has answered, whatever the answer,
 * so the next try starts empty. A wrong code is shown by `error` (the dots turn red
 * until the next digit) and by bumping `shakeKey` (a shake, or nothing under Reduce
 * Motion). `extraKey` is the spare key beside 0, e.g. Face ID.
 */

interface PinPadProps {
  onComplete: (pin: string) => void | Promise<void>;
  disabled?: boolean;
  error?: boolean;
  shakeKey?: number;
  extraKey?: { icon: string; label: string; onPress: () => void };
}

const KEY = 64;
const DOT = 14;

export default function PinPad({ onComplete, disabled, error, shakeKey = 0, extraKey }: PinPadProps) {
  const { tokens } = useTheme();
  const reduceMotion = useReducedMotion();
  const [digits, setDigits] = useState('');
  const digitsRef = useRef('');
  const busyRef = useRef(false);
  const shake = useRef(new Animated.Value(0)).current;

  const update = useCallback((next: string) => {
    digitsRef.current = next;
    setDigits(next);
  }, []);

  const press = useCallback(
    (digit: string) => {
      if (disabled || busyRef.current || digitsRef.current.length >= PIN_LENGTH) return;
      const next = digitsRef.current + digit;
      update(next);
      if (next.length < PIN_LENGTH) return;
      busyRef.current = true;
      Promise.resolve(onComplete(next))
        .catch((e) => console.error('PinPad: onComplete failed:', e))
        .finally(() => {
          busyRef.current = false;
          update('');
        });
    },
    [disabled, onComplete, update]
  );

  const back = useCallback(() => {
    if (disabled || busyRef.current) return;
    update(digitsRef.current.slice(0, -1));
  }, [disabled, update]);

  // A physical keyboard, where there is one.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // Typing in a text field (a password beside the pad, say) is not for the pad.
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (/^[0-9]$/.test(event.key)) press(event.key);
      else if (event.key === 'Backspace') back();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [press, back]);

  useEffect(() => {
    if (!shakeKey || reduceMotion) return;
    const step = (toValue: number) => Animated.timing(shake, { toValue, duration: 50, useNativeDriver: Platform.OS !== 'web' });
    Animated.sequence([step(-10), step(10), step(-8), step(8), step(0)]).start();
  }, [shakeKey, reduceMotion, shake]);

  const showError = !!error && digits.length === 0;

  const keyStyle = (pressed: boolean) => ({
    width: KEY,
    height: KEY,
    borderRadius: radius.full,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: pressed ? tokens.colors.surfaceHover : tokens.colors.surfaceSunken,
  });

  const digitKey = (digit: string) => (
    <Pressable
      key={digit}
      accessibilityRole="button"
      accessibilityLabel={digit}
      disabled={disabled}
      onPress={() => press(digit)}
      style={({ pressed }) => keyStyle(pressed)}
    >
      <Text style={[type.h1, tabularNums, { color: disabled ? tokens.colors.textFaint : tokens.colors.text }]}>{digit}</Text>
    </Pressable>
  );

  const spare = (
    <View style={{ width: KEY, height: KEY, alignItems: 'center', justifyContent: 'center' }}>
      {extraKey ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={extraKey.label}
          disabled={disabled}
          onPress={extraKey.onPress}
          style={({ pressed }) => ({ ...keyStyle(pressed), backgroundColor: pressed ? tokens.colors.surfaceHover : 'transparent' })}
        >
          <Icon name={extraKey.icon as any} size={30} color={disabled ? tokens.colors.textFaint : tokens.colors.brand} />
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <View style={{ alignItems: 'center' }}>
      <Animated.View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${digits.length} of ${PIN_LENGTH} digits entered`}
        accessibilityLiveRegion="polite"
        style={{ flexDirection: 'row', gap: space.s4, marginVertical: space.s4, transform: [{ translateX: shake }] }}
      >
        {Array.from({ length: PIN_LENGTH }, (_, i) => {
          const filled = i < digits.length;
          return (
            <View
              key={i}
              style={{
                width: DOT,
                height: DOT,
                borderRadius: radius.full,
                borderWidth: 1.5,
                borderColor: showError ? tokens.colors.danger : filled ? tokens.colors.text : tokens.colors.borderStrong,
                backgroundColor: showError ? tokens.colors.danger : filled ? tokens.colors.text : 'transparent',
              }}
            />
          );
        })}
      </Animated.View>

      <View style={{ width: KEY * 3 + space.s5 * 2, flexDirection: 'row', flexWrap: 'wrap', rowGap: space.s3, columnGap: space.s5, justifyContent: 'center' }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digitKey)}
        {spare}
        {digitKey('0')}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete"
          disabled={disabled || digits.length === 0}
          onPress={back}
          style={({ pressed }) => ({ ...keyStyle(pressed), backgroundColor: pressed ? tokens.colors.surfaceHover : 'transparent' })}
        >
          <Icon name="backspace-outline" size={26} color={disabled || digits.length === 0 ? tokens.colors.textFaint : tokens.colors.text} />
        </Pressable>
      </View>
    </View>
  );
}
