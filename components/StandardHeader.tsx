import React from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useBreakpoint, STATUS_BAND } from '../hooks/useBreakpoint';
import type { LargeTitleState } from '../hooks/useLargeTitle';
import Icon from './Icon';
import { type, radius, space } from '../styles/tokens';

/**
 * Slim screen header (DESIGN.md §2.6): flat bg, left-aligned title, 44px
 * labeled icon buttons. No gradients, no floating circles.
 * Keeps the legacy slot API so existing screens work unchanged.
 */

const BUTTON_SIZE = 44;
/** The bar's height on every screen: a button row plus its vertical padding. */
export const HEADER_HEIGHT = BUTTON_SIZE + 2 * space.s2;
/** Wider than any title can lay out, so measuring it never wraps or truncates. */
const UNCUT_MEASURE_WIDTH = 4000;

interface HeaderButton {
  icon: string;
  onPress: () => void;
  backgroundColor?: string;
  iconColor?: string;
  accessibilityLabel?: string;
}

/**
 * Trailing "done" action for edit/create forms: a filled green circle with a
 * checkmark (iOS 26 confirm button), so saving never needs a scroll to the
 * bottom. Greys out while disabled; shows a spinner while saving.
 */
interface HeaderConfirm {
  onPress: () => void;
  /** Unsaved edits: the leading button turns from ← (back) into ✕ (discard). */
  dirty?: boolean;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
}

interface StandardHeaderProps {
  title: string;
  subtitle?: string;
  leftIcon?: string;
  rightIcon?: string;
  onLeftPress?: () => void;
  onRightPress?: () => void;
  loading?: boolean;
  rightIconColor?: string;
  leftIconColor?: string;
  showRightIcon?: boolean;
  showLeftIcon?: boolean;
  rightButtons?: HeaderButton[];
  leftButtons?: HeaderButton[];
  backgroundColor?: string;
  confirm?: HeaderConfirm;
  /**
   * Tab roots on compact: start as a bare bar with the title shown large in
   * the content (`<LargeTitle>`), collapsing to this header on scroll.
   */
  largeTitle?: LargeTitleState;
}

// Fallback spoken labels for common icon-only header buttons.
const ICON_LABELS: Record<string, string> = {
  'arrow-back': 'Go back',
  add: 'Add',
  'add-circle-outline': 'Add',
  close: 'Close',
  'create-outline': 'Edit',
  'trash-outline': 'Delete',
  'filter-outline': 'Filter',
  'search-outline': 'Search',
  'settings-outline': 'Settings',
  'wallet-outline': 'Budgets',
  'lock-closed-outline': 'Lock',
  'checkmark': 'Confirm',
};

export default function StandardHeader({
  title,
  subtitle,
  leftIcon,
  rightIcon = 'add',
  onLeftPress,
  onRightPress,
  loading = false,
  rightIconColor,
  leftIconColor,
  showRightIcon = true,
  showLeftIcon = true,
  rightButtons,
  leftButtons,
  backgroundColor,
  confirm,
  largeTitle,
}: StandardHeaderProps) {
  const { tokens } = useTheme();
  const bp = useBreakpoint();
  const large = largeTitle?.enabled ? largeTitle : undefined;

  const buttonSize = BUTTON_SIZE;
  const iconSize = 22;

  const renderButton = (btn: HeaderButton, kind: 'left' | 'right', idx: number) => {
    const isPrimary = kind === 'right' && !btn.backgroundColor;
    // The primary action is a solid brand button: the pale tint it used to have all but
    // vanished against the light page. A caller's own icon colour keeps the soft tint
    // (their colour wouldn't be legible on the solid fill).
    const solid = isPrimary && !btn.iconColor;
    const bg = btn.backgroundColor || (solid ? tokens.colors.brand : isPrimary ? tokens.colors.brandSubtle : 'transparent');
    const fg = btn.iconColor || (solid ? tokens.colors.onBrand : tokens.colors.text);
    const label = btn.accessibilityLabel || ICON_LABELS[btn.icon] || btn.icon.replace(/-outline$|-circle$/, '').replace(/-/g, ' ');

    return (
      <Pressable
        key={`${kind}_btn_${idx}`}
        onPress={btn.onPress}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed, hovered }: any) => ({
          width: buttonSize,
          height: buttonSize,
          borderRadius: radius.md,
          // A solid button dims on press (a pale hover fill would swallow its icon).
          backgroundColor: solid ? bg : pressed || hovered ? tokens.colors.surfaceHover : bg,
          opacity: solid ? (pressed ? 0.85 : hovered ? 0.92 : 1) : 1,
          justifyContent: 'center',
          alignItems: 'center',
          marginLeft: kind === 'right' && idx > 0 ? space.s2 : 0,
          marginRight: kind === 'left' ? space.s2 : 0,
          // @ts-ignore web transition
          transitionDuration: '150ms',
        })}
      >
        {loading && kind === 'right' ? (
          <ActivityIndicator size="small" color={fg} />
        ) : (
          <Icon name={btn.icon as any} size={iconSize} color={fg} />
        )}
      </Pressable>
    );
  };

  const renderConfirm = (c: HeaderConfirm) => {
    const inactive = !!c.disabled || !!c.loading;
    const fg = c.disabled ? tokens.colors.textFaint : tokens.colors.onIncome;
    return (
      <Pressable
        onPress={c.onPress}
        disabled={inactive}
        accessibilityRole="button"
        accessibilityLabel={c.accessibilityLabel || 'Save'}
        accessibilityState={{ disabled: !!c.disabled, busy: !!c.loading }}
        style={({ pressed }) => ({
          width: buttonSize,
          height: buttonSize,
          borderRadius: radius.full,
          backgroundColor: c.disabled ? tokens.colors.surfaceSunken : tokens.colors.income,
          justifyContent: 'center',
          alignItems: 'center',
          marginLeft: right.length ? space.s2 : 0,
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.94 : 1 }],
          // @ts-ignore web transition
          transitionDuration: '150ms',
        })}
      >
        {c.loading ? (
          <ActivityIndicator size="small" color={fg} />
        ) : (
          <Icon name="checkmark" size={iconSize + 2} color={fg} />
        )}
      </Pressable>
    );
  };

  const left = leftButtons && leftButtons.length > 0
    ? leftButtons
    : showLeftIcon && onLeftPress
      ? [
          // Forms with a confirm tick lead with ← until something changes,
          // then ✕ (cancel), iOS-style, so leaving reads as "discard changes"
          // only when there is something to discard.
          confirm?.dirty && !leftIcon
            ? { icon: 'close', onPress: onLeftPress, iconColor: leftIconColor, accessibilityLabel: 'Cancel' }
            : { icon: leftIcon ?? 'arrow-back', onPress: onLeftPress, iconColor: leftIconColor },
        ]
      : [];
  const right = rightButtons && rightButtons.length > 0
    ? rightButtons
    : !confirm && showRightIcon && onRightPress
      ? [{ icon: rightIcon, onPress: onRightPress, iconColor: rightIconColor }]
      : [];

  // Large title: the title sits in the bar's own row at display size, level
  // with the buttons, and shrinks in place to the bar's h2 as the content
  // scrolls; the subtitle rides up beneath it. Positions come from the
  // measured bar height and the type tokens.
  // The bar is one height on every screen, with or without a subtitle or buttons, so
  // the buttons and the resting title sit in the same place when you move between
  // tabs. The collapsed title + subtitle block is a little taller than the button
  // row; it overhangs the padding rather than growing the bar.
  const minHeight = HEADER_HEIGHT;
  const [barHeight, setBarHeight] = React.useState(minHeight);
  // The large title is truncated at display size, then scaled down, so a long title
  // would keep its ellipsis in the collapsed bar even though it has room for more.
  // When it is cut at rest, a separate bar-size label (laid out at its own size)
  // takes over as it collapses, as UIKit's inline title does.
  const [slotWidth, setSlotWidth] = React.useState(0);
  const [titleWidth, setTitleWidth] = React.useState(0);
  const truncatedAtRest = slotWidth > 0 && titleWidth > slotWidth;
  const scale = type.h2.fontSize / type.display.fontSize;
  const smallBlock = type.h2.lineHeight + (subtitle ? 1 + type.caption.lineHeight : 0);
  const yCol = (barHeight - smallBlock) / 2; // collapsed title block, centred
  // At rest the title is centred on the row (level with the buttons).
  const titleTopRest = barHeight / 2 - type.display.lineHeight / 2;
  const titleShiftCol = yCol + type.h2.lineHeight / 2 - barHeight / 2;
  const subTopRest = type.display.lineHeight + space.s1; // below the large title, in title coords
  const subShiftCol = yCol + type.h2.lineHeight + 1 - (titleTopRest + subTopRest);
  const collapseDistance = space.s7;
  // Content room for whatever hangs below the bar at rest (the subtitle).
  const overhang = subtitle
    ? Math.max(0, Math.ceil(titleTopRest + subTopRest + type.caption.lineHeight - barHeight))
    : 0;
  const spacerHeight = overhang;

  const setGeometry = large?.setGeometry;
  React.useEffect(() => {
    setGeometry?.({ collapseDistance, spacerHeight });
  }, [setGeometry, collapseDistance, spacerHeight]);

  let chromeOpacity: Animated.AnimatedInterpolation<number> | number = 1;
  let titleSlot: React.ReactNode;
  if (large) {
    const d = collapseDistance;
    const y = large.scrollY;
    const range = { inputRange: [0, d], extrapolate: 'clamp' as const };
    // The fill and hairline arrive as the title lands.
    chromeOpacity = y.interpolate({ inputRange: [d * 0.5, d], outputRange: [0, 1], extrapolate: 'clamp' });
    const titleScale = y.interpolate({ ...range, outputRange: [1, scale] });
    const titleY = y.interpolate({ ...range, outputRange: [0, titleShiftCol] });
    const subY = y.interpolate({ ...range, outputRange: [0, subShiftCol] });
    // Cut titles hand over between the two labels while the large one is mid-shrink.
    const handOver = { inputRange: [d * 0.5, d * 0.9], extrapolate: 'clamp' as const };
    const largeOpacity = truncatedAtRest ? y.interpolate({ ...handOver, outputRange: [1, 0] }) : 1;
    const smallOpacity = y.interpolate({ ...handOver, outputRange: [0, 1] });
    // Where the scaled large title's line box lands, in slot coordinates.
    const smallTop = type.display.lineHeight / 2 + titleShiftCol - type.h2.lineHeight / 2;
    titleSlot = (
      <View
        // The gap keeps a title that fills the slot off the trailing button.
        style={{ flex: 1, marginRight: space.s2 }}
        pointerEvents="none"
        onLayout={(e) => setSlotWidth(e.nativeEvent.layout.width)}
      >
        {/* Invisible: the title's uncut width at display size, to tell if it is cut at rest. */}
        <View
          aria-hidden
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: type.display.lineHeight, overflow: 'hidden', opacity: 0 }}
        >
          <View style={{ width: UNCUT_MEASURE_WIDTH, flexDirection: 'row' }}>
            <Text
              numberOfLines={1}
              style={type.display}
              onLayout={(e) => setTitleWidth(e.nativeEvent.layout.width)}
            >
              {title}
            </Text>
          </View>
        </View>
        <Animated.Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[
            type.display,
            {
              color: tokens.colors.text,
              opacity: largeOpacity,
              transformOrigin: 'left center',
              transform: [{ translateY: titleY }, { scale: titleScale }],
            },
          ]}
        >
          {title}
        </Animated.Text>
        {truncatedAtRest ? (
          <Animated.Text
            aria-hidden
            numberOfLines={1}
            style={[
              type.h2,
              { position: 'absolute', top: smallTop, left: 0, right: 0, color: tokens.colors.text, opacity: smallOpacity },
            ]}
          >
            {title}
          </Animated.Text>
        ) : null}
        {subtitle ? (
          <Animated.Text
            numberOfLines={1}
            style={[
              type.caption,
              {
                position: 'absolute',
                top: subTopRest,
                left: 0,
                right: 0,
                color: tokens.colors.textMuted,
                transform: [{ translateY: subY }],
              },
            ]}
          >
            {subtitle}
          </Animated.Text>
        ) : null}
      </View>
    );
  } else {
    titleSlot = (
      // Pinned to the button row's height so a subtitle can't grow the bar.
      <View style={{ flex: 1, height: buttonSize, justifyContent: 'center' }}>
        <Text
          accessibilityRole="header"
          style={[type.h2, { color: tokens.colors.text }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.caption, { color: tokens.colors.textMuted, marginTop: 1 }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    );
  }

  // Web compact: the fill reaches up behind the status bar (the screen
  // container holds that band, useThemedStyles), so bar and status bar read
  // as one surface, and a large-title screen at rest is page bg all the way up.
  const underStatusBar = Platform.OS === 'web' && bp.isCompact;

  return (
    <View
      onLayout={large ? (e) => setBarHeight(Math.round(e.nativeEvent.layout.height)) : undefined}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight,
        paddingHorizontal: bp.gutter,
        paddingVertical: space.s2,
        // The subtitle hangs below the bar at rest, over the scroll content,
        // so the bar paints above its sibling scroller.
        ...(large ? { zIndex: 1 } : null),
        // @ts-ignore web-only sticky header + material
        ...(Platform.OS === 'web'
          ? {
              position: 'sticky',
              top: 0,
              zIndex: 100,
            }
          : {}),
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          top: underStatusBar ? (`calc(-1 * ${STATUS_BAND})` as unknown as number) : 0,
          opacity: chromeOpacity,
          // Web: opaque `surface`, matching the colour iOS 27 extends under
          // the status bar (a translucent header drifts from it as content
          // passes underneath). Native: the header sits in flow, so page bg.
          backgroundColor:
            backgroundColor || (Platform.OS === 'web' ? tokens.colors.surface : tokens.colors.bg),
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: tokens.colors.borderStrong,
        }}
      />

      {left.map((btn, idx) => renderButton(btn, 'left', idx))}

      {titleSlot}

      {right.map((btn, idx) => renderButton(btn, 'right', idx))}
      {confirm ? renderConfirm(confirm) : null}
    </View>
  );
}

/**
 * First child of a `largeTitle` screen's scroll content: the gap below the
 * header at rest, plus room for the subtitle that hangs below the bar. The
 * title itself is drawn by the header. Renders nothing when the large title is
 * off (medium+).
 */
export function LargeTitle({ largeTitle }: { largeTitle: LargeTitleState }) {
  if (!largeTitle.enabled) return null;
  return <View style={{ height: largeTitle.spacerHeight, marginBottom: space.s4 }} />;
}
