import React from 'react';
import { View, Text, Pressable, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import Icon from '../Icon';
import { type, radius, space } from '../../styles/tokens';

/**
 * Chip per DESIGN.md §2.8: 28px, icon + caption label. Semantic chips
 * (household/personal/debt) must carry an icon so color is never the sole
 * carrier. Dismissible filter chips make the whole chip the dismiss target.
 */

interface ChipProps {
  label: string;
  icon?: string;
  /** Explicit fg/bg pair; defaults to neutral. */
  color?: string;
  backgroundColor?: string;
  selected?: boolean;
  onPress?: () => void;
  /** Renders a trailing ✕ and makes the chip announce as removable. */
  onDismiss?: () => void;
  style?: ViewStyle | ViewStyle[];
}

export default function Chip({
  label,
  icon,
  color,
  backgroundColor,
  selected,
  onPress,
  onDismiss,
  style,
}: ChipProps) {
  const { tokens } = useTheme();

  const fg = color ?? (selected ? tokens.colors.onBrandSubtle : tokens.colors.textMuted);
  const bg = backgroundColor ?? (selected ? tokens.colors.brandSubtle : tokens.colors.surfaceSunken);
  const interactive = onPress || onDismiss;

  const content = (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          height: 28,
          paddingHorizontal: space.s3,
          borderRadius: radius.full,
          backgroundColor: bg,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon as any} size={14} color={fg} style={{ marginRight: space.s1 }} /> : null}
      <Text style={[type.caption, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
      {onDismiss ? <Icon name="close" size={14} color={fg} style={{ marginLeft: space.s1 }} /> : null}
    </View>
  );

  if (!interactive) return content;

  return (
    <Pressable
      onPress={onDismiss ?? onPress}
      accessibilityRole="button"
      accessibilityLabel={onDismiss ? `Remove filter: ${label}` : label}
      accessibilityState={{ selected: !!selected }}
      // Keep the visual 28px but give a >=44px touch target.
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {content}
    </Pressable>
  );
}
