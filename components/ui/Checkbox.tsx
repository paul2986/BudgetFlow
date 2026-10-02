import React from 'react';
import { View, Pressable, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import Icon from '../Icon';
import { radius } from '../../styles/tokens';

/**
 * Selection box for lists and tables. Checked = solid brand fill + tick,
 * mixed (some rows ticked) = fill + dash, so state is never colour alone.
 * With `onPress` it is its own 44pt control; without, it is just the visual,
 * for a row that is itself the control (the phone's selection mode).
 * `circle` is the phone list's shape, `square` the table's.
 */

interface CheckboxProps {
  checked: boolean | 'mixed';
  onPress?: (event: any) => void;
  /** Spoken name of the control; required when it is pressable. */
  accessibilityLabel?: string;
  shape?: 'circle' | 'square';
  size?: number;
  style?: ViewStyle;
}

export default function Checkbox({
  checked,
  onPress,
  accessibilityLabel,
  shape = 'square',
  size = 22,
  style,
}: CheckboxProps) {
  const { tokens } = useTheme();
  const on = checked !== false;

  const box = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: shape === 'circle' ? radius.full : radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: on ? tokens.colors.brand : 'transparent',
        borderWidth: on ? 0 : 2,
        borderColor: tokens.colors.borderStrong,
      }}
    >
      {on ? (
        <Icon
          name={checked === 'mixed' ? 'remove' : 'checkmark'}
          size={Math.round(size * 0.8)}
          color={tokens.colors.onBrand}
        />
      ) : null}
    </View>
  );

  if (!onPress) return <View style={style}>{box}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked }}
      style={({ pressed }) => [
        { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 },
        style,
      ]}
    >
      {box}
    </Pressable>
  );
}
