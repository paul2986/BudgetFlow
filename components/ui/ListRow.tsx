import React, { useState } from 'react';
import { View, Text, Pressable, ViewStyle, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import Icon from '../Icon';
import { type, radius, space } from '../../styles/tokens';

/**
 * ListRow per DESIGN.md §2.8: 64px min, leading glyph circle, primary +
 * caption text block, trailing slot. The row body is one touch target; a
 * secondary control (e.g. a "more" button) goes in `accessory`, which renders
 * beside the row button, never inside it, so web never nests <button>s.
 */

interface ListRowProps {
  title: string;
  caption?: string;
  /** Lines the caption may wrap to before truncating (default 1, for scannable lists). */
  captionLines?: number;
  /** Ionicons name for the leading glyph. */
  icon?: string;
  /** Short text in the glyph circle instead of an icon (e.g. a currency symbol). */
  glyphText?: string;
  iconColor?: string;
  /** Custom leading element (e.g. Avatar) — overrides icon. */
  leading?: React.ReactNode;
  /** Trailing content: amount, chevron, etc. */
  trailing?: React.ReactNode;
  /** Extra content under the caption (e.g. chip row). */
  children?: React.ReactNode;
  onPress?: () => void;
  /** Separate trailing control (its own button), rendered outside the row button. */
  accessory?: React.ReactNode;
  /** Spoken description for screen readers (one sentence). */
  accessibilityLabel?: string;
  style?: ViewStyle | ViewStyle[];
  showSeparator?: boolean;
  /** Trailing disclosure chevron for rows that navigate. */
  chevron?: boolean;
  /** Danger-tinted title and glyph for destructive actions (sign out, erase). */
  destructive?: boolean;
}

export default function ListRow({
  title,
  caption,
  captionLines = 1,
  icon,
  glyphText,
  iconColor,
  leading,
  trailing,
  children,
  onPress,
  accessory,
  accessibilityLabel,
  style,
  showSeparator = true,
  chevron = false,
  destructive = false,
}: ListRowProps) {
  const { tokens } = useTheme();
  const [hovered, setHovered] = useState(false);
  const hasGlyph = !!(icon || glyphText);
  const glyphColor = destructive ? tokens.colors.danger : iconColor || tokens.colors.textMuted;

  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>
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
            // Only tappable rows highlight; static rows (e.g. a switch row) stay flat.
            backgroundColor: onPress && (pressed || hovered) ? tokens.colors.surfaceHover : 'transparent',
            flex: 1,
            paddingRight: accessory ? space.s2 : space.s4,
            // @ts-ignore web transition
            transitionDuration: '150ms',
          },
        ]}
      >
        {leading ??
          (hasGlyph ? (
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: radius.full,
                backgroundColor: destructive ? tokens.colors.dangerSubtle : tokens.colors.surfaceSunken,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {glyphText ? (
                // Multi-character symbols (HK$, CHF) drop to caption to fit the circle.
                <Text
                  style={[glyphText.length > 2 ? type.caption : type.bodyMed, { color: glyphColor }]}
                  numberOfLines={1}
                >
                  {glyphText}
                </Text>
              ) : (
                <Icon name={icon as any} size={18} color={glyphColor} />
              )}
            </View>
          ) : null)}

        <View style={{ flex: 1, marginLeft: leading || hasGlyph ? space.s3 : 0, marginRight: space.s3 }}>
          <Text style={[type.bodyMed, { color: destructive ? tokens.colors.danger : tokens.colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          {caption ? (
            <Text style={[type.caption, { color: tokens.colors.textMuted, marginTop: 2 }]} numberOfLines={captionLines}>
              {caption}
            </Text>
          ) : null}
          {children}
        </View>

        {trailing ? <View style={{ alignItems: 'flex-end' }}>{trailing}</View> : null}
        {chevron ? (
          <Icon
            name="chevron-forward"
            size={18}
            color={tokens.colors.textFaint}
            style={{ marginLeft: trailing ? space.s2 : 0 }}
          />
        ) : null}
      </Pressable>

      {accessory ? <View style={{ paddingRight: space.s2 }}>{accessory}</View> : null}

      {showSeparator ? (
        <View
          style={{
            position: 'absolute',
            // Edge to edge: rows in a group read as separate items, not an indented list.
            left: 0,
            right: 0,
            bottom: 0,
            height: StyleSheet.hairlineWidth,
            // Quieter `border` grey: rows sit in one group, so the line only needs to hint.
            backgroundColor: tokens.colors.border,
          }}
        />
      ) : null}
    </View>
  );
}
