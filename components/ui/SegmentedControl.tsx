import React from 'react';
import { View, Text, Pressable, ViewStyle, Platform } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { type, radius, space, elevation } from '../../styles/tokens';

/**
 * SegmentedControl per DESIGN.md §2.8: surfaceSunken track, raised active
 * segment. Used for Daily/Monthly/Yearly, theme selection, login/register.
 */

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: ViewStyle | ViewStyle[];
  /** Accessible name for the group. */
  label?: string;
}

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
  label,
}: SegmentedControlProps<T>) {
  const { tokens } = useTheme();

  return (
    <View
      accessibilityRole={Platform.OS === 'web' ? ('tablist' as any) : 'radiogroup'}
      accessibilityLabel={label}
      style={[
        {
          flexDirection: 'row',
          backgroundColor: tokens.colors.surfaceSunken,
          borderRadius: radius.md,
          padding: 2,
        },
        style,
      ]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole={Platform.OS === 'web' ? ('tab' as any) : 'radio'}
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              {
                flex: 1,
                minHeight: 36,
                borderRadius: radius.md - 2,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: space.s3,
                backgroundColor: selected ? tokens.colors.surface : 'transparent',
                opacity: pressed ? 0.8 : 1,
                // @ts-ignore web transition
                transitionDuration: '220ms',
              },
              selected ? elevation.e1 : null,
            ]}
          >
            <Text
              style={[
                selected ? type.bodyMed : type.body,
                {
                  fontSize: type.caption.fontSize + 1,
                  lineHeight: type.caption.lineHeight,
                  color: selected ? tokens.colors.text : tokens.colors.textMuted,
                },
              ]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
