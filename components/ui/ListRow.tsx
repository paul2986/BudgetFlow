import React, { useState } from 'react';
import { View, Text, Pressable, Platform, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import Icon from '../Icon';
import { type, radius, space } from '../../styles/tokens';

/**
 * ListRow per DESIGN.md §2.8: 64px min, leading glyph circle, primary +
 * caption text block, trailing slot. The whole row is one touch target;
 * secondary actions belong in swipe (compact) or hover-revealed buttons
 * (pointer devices) supplied via `hoverActions`.
 */

interface ListRowProps {
  title: string;
  caption?: string;
  /** Ionicons name for the leading glyph. */
  icon?: string;
  iconColor?: string;
  /** Custom leading element (e.g. Avatar) — overrides icon. */
  leading?: React.ReactNode;
  /** Trailing content: amount, chevron, etc. */
  trailing?: React.ReactNode;
  /** Extra content under the caption (e.g. chip row). */
  children?: React.ReactNode;
  onPress?: () => void;
  /** Revealed on hover on pointer devices; hidden on touch. */
  hoverActions?: React.ReactNode;
  /** Spoken description for screen readers (one sentence). */
  accessibilityLabel?: string;
  style?: ViewStyle | ViewStyle[];
  showSeparator?: boolean;
}

export default function ListRow({
  title,
  caption,
  icon,
  iconColor,
  leading,
  trailing,
  children,
  onPress,
  hoverActions,
  accessibilityLabel,
  style,
  showSeparator = true,
}: ListRowProps) {
  const { tokens } = useTheme();
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel || title}
      style={({ pressed }) => [
        {
          minHeight: 64,
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: space.s3,
          paddingHorizontal: space.s4,
          backgroundColor: pressed || hovered ? tokens.colors.surfaceSunken : 'transparent',
          borderRadius: radius.md,
          // @ts-ignore web transition
          transitionDuration: '150ms',
        },
        style,
      ]}
    >
      {leading ??
        (icon ? (
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: radius.full,
              backgroundColor: tokens.colors.surfaceSunken,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={icon as any} size={18} color={iconColor || tokens.colors.textMuted} />
          </View>
        ) : null)}

      <View style={{ flex: 1, marginLeft: leading || icon ? space.s3 : 0, marginRight: space.s3 }}>
        <Text style={[type.h3, { color: tokens.colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {caption ? (
          <Text style={[type.caption, { color: tokens.colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
        {children}
      </View>

      {hoverActions && (hovered || Platform.OS !== 'web') === false ? null : null}
      {hoverActions && hovered ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: space.s2 }}>
          {hoverActions}
        </View>
      ) : null}

      {trailing ? <View style={{ alignItems: 'flex-end' }}>{trailing}</View> : null}

      {showSeparator ? (
        <View
          style={{
            position: 'absolute',
            left: leading || icon ? space.s4 + 36 + space.s3 : space.s4,
            right: 0,
            bottom: 0,
            height: 1,
            backgroundColor: tokens.colors.border,
          }}
        />
      ) : null}
    </Pressable>
  );
}
