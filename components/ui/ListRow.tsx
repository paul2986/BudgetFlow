import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ViewStyle, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import Icon from '../Icon';
import { type, radius, space, motion } from '../../styles/tokens';

/**
 * ListRow per DESIGN.md §2.8: 64px min, leading glyph circle, primary +
 * caption text block, trailing slot. The row body is one touch target; a
 * secondary control (e.g. a "more" button) goes in `accessory`, which renders
 * beside the row button, never inside it, so web never nests <button>s.
 */

const GLYPH_SIZE = 36;

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
  /** Full-width content under the whole row (e.g. a progress bar), lined up with the text when there is a glyph. */
  detail?: React.ReactNode;
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
  detail,
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
  const [pressed, setPressed] = useState(false);
  const highlighted = !!onPress && (pressed || hovered);
  const reducedMotion = useReducedMotion();

  // One fill for the whole row (button, side control and detail), faded by one value, so
  // its parts can never change at different moments.
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, {
      toValue: highlighted ? 1 : 0,
      duration: reducedMotion ? 0 : motion.fast,
      useNativeDriver: false,
    }).start();
  }, [highlighted, reducedMotion, fade]);
  const fill = fade.interpolate({
    inputRange: [0, 1],
    // The same colour fully transparent, so the fade doesn't pass through grey.
    outputRange: [`${tokens.colors.surfaceHover}00`, tokens.colors.surfaceHover],
  });

  // The pointer crosses from the button to the side control (and the detail) through
  // gaps between them; waiting a moment before "left" keeps the fill from dipping.
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(leaveTimer.current), []);
  const hoverIn = () => {
    clearTimeout(leaveTimer.current);
    setHovered(true);
  };
  const hoverOut = () => {
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => setHovered(false), 40);
  };
  const hasGlyph = !!(icon || glyphText);
  const glyphColor = destructive ? tokens.colors.danger : iconColor || tokens.colors.textMuted;

  return (
    <Animated.View
      style={[
        { flexDirection: 'row', alignItems: 'center', flexWrap: detail ? 'wrap' : 'nowrap', backgroundColor: fill },
        style as any,
      ]}
    >
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        onHoverIn={hoverIn}
        onHoverOut={hoverOut}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={accessibilityLabel || title}
        style={[
          {
            minHeight: 64,
            flexDirection: 'row',
            alignItems: 'center',
            paddingTop: space.s3,
            paddingBottom: detail ? space.s2 : space.s3,
            paddingHorizontal: space.s4,
            // Only tappable rows highlight; static rows (e.g. a switch row) stay flat.
            flex: 1,
            paddingRight: accessory ? space.s2 : space.s4,
          },
        ]}
      >
        {leading ??
          (hasGlyph ? (
            <View
              style={{
                width: GLYPH_SIZE,
                height: GLYPH_SIZE,
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

      {accessory ? (
        // Shares the row's hover and fill so the highlight is one block, not a block with a notch
        // where the control sits; the control inside keeps its own presses.
        <Pressable
          accessible={false}
          onHoverIn={hoverIn}
          onHoverOut={hoverOut}
          style={{
            alignSelf: 'stretch',
            justifyContent: 'center',
            paddingRight: space.s2,
          }}
        >
          {accessory}
        </Pressable>
      ) : null}

      {detail ? (
        // Wraps onto its own line below the row button and accessory. It shares the
        // button's press and hover state so the row highlights, and opens, as one.
        <Pressable
          onPress={onPress}
          disabled={!onPress}
          accessible={false}
          onHoverIn={hoverIn}
          onHoverOut={hoverOut}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          style={{
            width: '100%',
            paddingBottom: space.s3,
            paddingLeft: space.s4 + (hasGlyph ? GLYPH_SIZE + space.s3 : 0),
            paddingRight: space.s4,
          }}
        >
          {detail}
        </Pressable>
      ) : null}

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
    </Animated.View>
  );
}
