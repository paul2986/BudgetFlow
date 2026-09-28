import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { type, radius, space, elevation } from '../../styles/tokens';

/**
 * Inset grouped list (Apple Settings idiom): an optional small header above a
 * single surface that clips its ListRows, and an optional footer note below.
 * Rows inside draw their own hairline separators; pass `showSeparator={false}`
 * on the last row.
 */

interface ListGroupProps {
  children: React.ReactNode;
  header?: string;
  footer?: string;
  style?: ViewStyle | ViewStyle[];
}

export default function ListGroup({ children, header, footer, style }: ListGroupProps) {
  const { tokens } = useTheme();

  return (
    <View style={[{ marginBottom: space.s6 }, style]}>
      {header ? (
        <Text
          accessibilityRole="header"
          style={[
            type.caption,
            { color: tokens.colors.textMuted, marginBottom: space.s2, marginHorizontal: space.s4 },
          ]}
        >
          {header}
        </Text>
      ) : null}
      <View
        style={{
          backgroundColor: tokens.colors.surface,
          borderRadius: radius.lg,
          overflow: 'hidden',
          ...(tokens.isDark ? null : elevation.e1),
        }}
      >
        {children}
      </View>
      {footer ? (
        <Text
          style={[
            type.caption,
            { color: tokens.colors.textMuted, marginTop: space.s2, marginHorizontal: space.s4 },
          ]}
        >
          {footer}
        </Text>
      ) : null}
    </View>
  );
}
