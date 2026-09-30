import React from 'react';
import { Pressable, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import Icon from '../Icon';
import { radius } from '../../styles/tokens';

/**
 * Icon-only button: 44pt target, pressed fill on press-down, and a required
 * spoken label (an icon alone is never an accessible name).
 */

interface IconButtonProps {
  icon: string;
  accessibilityLabel: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  size?: number;
  style?: ViewStyle;
}

export default function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  color,
  disabled,
  size = 20,
  style,
}: IconButtonProps) {
  const { tokens } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed, hovered }: any) => [
        {
          width: 44,
          height: 44,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed || hovered ? tokens.colors.surfaceHover : 'transparent',
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}
    >
      <Icon name={icon as any} size={size} color={color ?? tokens.colors.textMuted} />
    </Pressable>
  );
}
