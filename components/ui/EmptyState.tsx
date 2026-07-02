import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import Icon from '../Icon';
import Button from '../Button';
import { type, radius, space } from '../../styles/tokens';

/**
 * EmptyState per DESIGN.md §2.8: icon in subtle circle, h3 title, one caption
 * line, one primary CTA.
 */

interface EmptyStateProps {
  icon: string;
  title: string;
  caption?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle | ViewStyle[];
}

export default function EmptyState({ icon, title, caption, actionLabel, onAction, style }: EmptyStateProps) {
  const { tokens } = useTheme();

  return (
    <View style={[{ alignItems: 'center', paddingVertical: space.s8, paddingHorizontal: space.s6 }, style]}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: radius.full,
          backgroundColor: tokens.colors.brandSubtle,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: space.s4,
        }}
      >
        <Icon name={icon as any} size={28} color={tokens.colors.brand} />
      </View>
      <Text
        accessibilityRole="header"
        style={[type.h3, { color: tokens.colors.text, textAlign: 'center' }]}
      >
        {title}
      </Text>
      {caption ? (
        <Text style={[type.caption, { color: tokens.colors.textMuted, textAlign: 'center', marginTop: space.s2, maxWidth: 320 }]}>
          {caption}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: space.s5, minWidth: 200 }}>
          <Button text={actionLabel} onPress={onAction} variant="primary" />
        </View>
      ) : null}
    </View>
  );
}
