import React, { useState } from 'react';
import { Text, Pressable, StyleSheet, ViewStyle, TextStyle, View, ActivityIndicator, Platform } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { type, radius, space } from '../styles/tokens';

/**
 * Button per design/DESIGN.md §2.8.
 * Flat fills only — no gradients, no glow. One primary per screen.
 */

interface ButtonProps {
  text?: string;
  title?: string;
  onPress: () => void;
  style?: ViewStyle | ViewStyle[];
  textStyle?: TextStyle;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  /** md = 44px (default), lg = 52px */
  size?: 'md' | 'lg';
}

export default function Button({
  text,
  title,
  onPress,
  style,
  textStyle,
  disabled,
  loading,
  icon,
  variant = 'primary',
  size = 'md',
}: ButtonProps) {
  const { tokens } = useTheme();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const buttonText = text || title || '';
  const isDisabled = disabled || loading;

  const palette = (() => {
    switch (variant) {
      case 'secondary':
        return {
          bg: tokens.colors.surfaceSunken,
          label: tokens.colors.text,
          borderColor: 'transparent',
          borderWidth: 0,
        };
      case 'outline':
        return {
          bg: hovered ? tokens.colors.surfaceSunken : 'transparent',
          label: tokens.colors.text,
          borderColor: tokens.colors.borderStrong,
          borderWidth: 1.5,
        };
      case 'ghost':
        return {
          bg: hovered ? tokens.colors.surfaceSunken : 'transparent',
          label: tokens.colors.brand,
          borderColor: 'transparent',
          borderWidth: 0,
        };
      case 'danger':
        return {
          bg: tokens.colors.danger,
          label: '#FFFFFF',
          borderColor: 'transparent',
          borderWidth: 0,
        };
      case 'primary':
      default:
        return {
          bg: tokens.colors.brand,
          label: tokens.colors.onBrand,
          borderColor: 'transparent',
          borderWidth: 0,
        };
    }
  })();

  const minHeight = size === 'lg' ? 52 : 44;

  // Web keyboard focus ring (RN style types don't know outline props).
  const focusRing =
    Platform.OS === 'web' && focused
      ? ({
          outlineWidth: 2,
          outlineColor: tokens.colors.brand,
          outlineStyle: 'solid',
          outlineOffset: 2,
        } as any)
      : null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        {
          minHeight,
          backgroundColor: palette.bg,
          borderColor: palette.borderColor,
          borderWidth: palette.borderWidth,
          opacity: isDisabled ? 0.4 : pressed ? 0.85 : hovered ? 0.92 : 1,
          transform: pressed && !isDisabled ? [{ scale: 0.98 }] : [],
        },
        focusRing,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={buttonText || undefined}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator
            size="small"
            color={palette.label}
            style={buttonText ? styles.loadingWithText : undefined}
          />
        ) : (
          icon && <View style={styles.iconContainer}>{icon}</View>
        )}
        {buttonText ? (
          <Text style={[styles.text, { color: palette.label }, textStyle]}>
            {buttonText}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: space.s3,
    paddingHorizontal: space.s6,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.s2,
    width: '100%',
    // @ts-ignore web transition
    transitionDuration: '150ms',
  } as ViewStyle,
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginRight: space.s2,
  },
  loadingWithText: {
    marginRight: space.s2,
  },
  text: {
    ...type.bodyMed,
  },
});
