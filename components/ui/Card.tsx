import React from 'react';
import { View, Text, ViewStyle, Pressable } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { type, radius, space, elevation } from '../../styles/tokens';

/**
 * Card per design/DESIGN.md §2.8: surface on the grouped-grey page, radius lg.
 * Separation comes from fill, not stroke: light mode adds a soft e1 lift, dark
 * mode relies on the stepped surface alone (no shadow, no border).
 * The only colored-border variant allowed is the 3px left accent strip for
 * warning/expired states — always paired with an icon + label in content.
 * With `onPress` the whole card is a button: sunken fill on press-down/hover.
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
  onPress?: () => void;
  /** Required with onPress: what the tap opens, for screen readers. */
  accessibilityLabel?: string;
}

export default function Card({ children, title, action, accent, style, padded = true, onPress, accessibilityLabel }: CardProps) {
  const { tokens } = useTheme();
  const bp = useBreakpoint();

  const padding = bp.isExpanded ? space.s6 : bp.isMedium ? space.s5 : space.s4;

  const cardStyle = (active = false) => [
    {
      backgroundColor: active ? tokens.colors.surfaceSunken : tokens.colors.surface,
      borderRadius: radius.lg,
      padding: padded ? padding : 0,
      ...(tokens.isDark ? null : elevation.e1),
    },
    accent
      ? { borderLeftWidth: 3, borderLeftColor: tokens.colors[accent] }
      : null,
    style,
  ];

  const content = (
    <>
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
    </>
  );

  if (!onPress) return <View style={cardStyle()}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => cardStyle(pressed || !!hovered)}
    >
      {content}
    </Pressable>
  );
}
