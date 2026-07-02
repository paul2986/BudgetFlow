import React, { useState } from 'react';
import { View, Text, TextInput, TextInputProps, Pressable, Platform, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import Icon from '../Icon';
import { type, radius, space, font } from '../../styles/tokens';

/**
 * Input per DESIGN.md §2.8: visible label above (never placeholder-only),
 * helper/error text below, 48px min height, focus ring, password toggle.
 */

interface InputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  helperText?: string;
  error?: string;
  /** Renders a show/hide toggle and secures the entry. */
  password?: boolean;
  /** Leading affix, e.g. a currency symbol. */
  prefix?: string;
  containerStyle?: ViewStyle | ViewStyle[];
  inputStyle?: TextInputProps['style'];
}

export default function Input({
  label,
  helperText,
  error,
  password,
  prefix,
  containerStyle,
  inputStyle,
  onFocus,
  onBlur,
  ...props
}: InputProps) {
  const { tokens } = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const borderColor = error
    ? tokens.colors.danger
    : focused
      ? tokens.colors.brand
      : tokens.colors.borderStrong;

  const webFocusRing =
    Platform.OS === 'web' && focused
      ? ({ outlineWidth: 2, outlineColor: error ? tokens.colors.danger : tokens.colors.brand, outlineStyle: 'solid', outlineOffset: 1 } as any)
      : null;

  return (
    <View style={containerStyle}>
      <Text style={[type.caption, { color: tokens.colors.textMuted, marginBottom: space.s2 }]}>
        {label}
      </Text>
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 48,
            backgroundColor: tokens.colors.surfaceSunken,
            borderWidth: 1,
            borderColor,
            borderRadius: radius.sm,
            paddingHorizontal: space.s4,
          },
          webFocusRing,
        ]}
      >
        {prefix ? (
          <Text style={[type.bodyMed, { color: tokens.colors.textMuted, marginRight: space.s2 }]}>
            {prefix}
          </Text>
        ) : null}
        <TextInput
          {...props}
          accessibilityLabel={label}
          secureTextEntry={password && !revealed}
          placeholderTextColor={tokens.colors.textFaint}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            {
              flex: 1,
              paddingVertical: space.s3,
              fontSize: type.body.fontSize,
              color: tokens.colors.text,
              ...font(400),
              // @ts-ignore web: suppress UA outline; the container carries the ring
              ...(Platform.OS === 'web' ? { outlineWidth: 0 } : {}),
            },
            inputStyle,
          ]}
        />
        {password ? (
          <Pressable
            onPress={() => setRevealed((r) => !r)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            style={{ marginLeft: space.s2 }}
          >
            <Icon name={revealed ? 'eye-off-outline' : 'eye-outline'} size={20} color={tokens.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <View
          accessibilityRole={Platform.OS === 'web' ? ('alert' as any) : undefined}
          accessibilityLiveRegion="polite"
          style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.s1 }}
        >
          <Icon name="alert-circle" size={14} color={tokens.colors.danger} style={{ marginRight: space.s1 }} />
          <Text style={[type.caption, { color: tokens.colors.danger, flex: 1 }]}>{error}</Text>
        </View>
      ) : helperText ? (
        <Text style={[type.caption, { color: tokens.colors.textFaint, marginTop: space.s1 }]}>
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}
