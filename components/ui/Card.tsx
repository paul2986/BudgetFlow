import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { type, radius, space, elevation } from '../../styles/tokens';

/**
 * Card per design/DESIGN.md §2.8: surface, radius lg, e1 + hairline border.
 * The only colored-border variant allowed is the 3px left accent strip for
 * warning/expired states — always paired with an icon + label in content.
 */

interface CardProps {
  children: React.ReactNode;
  /** Optional header row: title (h3) + right-aligned action slot. */
  title?: string;
  action?: React.ReactNode;
  /** 3px left accent strip for state emphasis. */
  accent?: 'warning' | 'danger' | 'income' | 'expense' | 'brand';
  style?: ViewStyle | ViewStyle[];
  padded?: boolean;
}

export default function Card({ children, title, action, accent, style, padded = true }: CardProps) {
  const { tokens } = useTheme();
  const bp = useBreakpoint();

  const padding = bp.isExpanded ? space.s6 : bp.isMedium ? space.s5 : space.s4;

  return (
    <View
      style={[
        {
          backgroundColor: tokens.colors.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: tokens.colors.border,
          padding: padded ? padding : 0,
          ...elevation.e1,
        },
        accent
          ? { borderLeftWidth: 3, borderLeftColor: tokens.colors[accent] }
          : null,
        style,
      ]}
    >
      {(title || action) && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: space.s3,
            paddingHorizontal: padded ? 0 : padding,
            paddingTop: padded ? 0 : padding,
          }}
        >
          {title ? (
            <Text
              accessibilityRole="header"
              style={[type.h3, { color: tokens.colors.text, flex: 1 }]}
              numberOfLines={1}
            >
              {title}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {action}
        </View>
      )}
      {children}
    </View>
  );
}
