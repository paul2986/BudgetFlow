import React from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useBreakpoint, STATUS_BAND } from '../hooks/useBreakpoint';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { LargeTitleState } from '../hooks/useLargeTitle';
import Icon from './Icon';
import { type, radius, space } from '../styles/tokens';

/**
 * Slim screen header (DESIGN.md §2.6): flat bg, left-aligned title, 44px
 * labeled icon buttons. No gradients, no floating circles.
 * Keeps the legacy slot API so existing screens work unchanged.
 */

export const HEADER_HEIGHT = 56;
export const HEADER_HEIGHT_IPAD = 64;

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
  const reducedMotion = useReducedMotion();
  const large = largeTitle?.enabled ? largeTitle : undefined;

  const buttonSize = 44;
  const iconSize = 22;

  const renderButton = (btn: HeaderButton, kind: 'left' | 'right', idx: number) => {
    const isPrimary = kind === 'right' && !btn.backgroundColor;
    const bg = btn.backgroundColor || (isPrimary ? tokens.colors.brandSubtle : 'transparent');
    const fg = btn.iconColor || (isPrimary ? tokens.colors.brand : tokens.colors.text);
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
          backgroundColor: pressed || hovered ? tokens.colors.surfaceHover : bg,
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

  // Large title: one title that scrolls up with the content while shrinking
  // from display size to the bar's h2, landing exactly where the bar's own
  // title sits, so it never clips or cross-fades. Positions come from the
  // measured bar height and the type tokens.
  const minHeight = subtitle ? HEADER_HEIGHT + 12 : HEADER_HEIGHT;
  const [barHeight, setBarHeight] = React.useState(minHeight);
  const scale = type.h2.fontSize / type.display.fontSize;
  const smallBlock = type.h2.lineHeight + (subtitle ? 1 + type.caption.lineHeight : 0);
  const yCol = (barHeight - smallBlock) / 2; // bar title block, centred
  const titleYCol = yCol + (type.h2.lineHeight - type.display.lineHeight * scale) / 2;
  const titleYExp = barHeight; // first thing in the content, just below the bar
  const subYCol = yCol + type.h2.lineHeight + 1;
  const subYExp = titleYExp + type.display.lineHeight + space.s1;
  const collapseDistance = Math.max(1, Math.round(titleYExp - titleYCol));
  const spacerHeight = type.display.lineHeight + (subtitle ? space.s1 + type.caption.lineHeight : 0);

  const setGeometry = large?.setGeometry;
  React.useEffect(() => {
    setGeometry?.({ collapseDistance, spacerHeight });
  }, [setGeometry, collapseDistance, spacerHeight]);

  let chromeOpacity: Animated.AnimatedInterpolation<number> | number = 1;
  let largeTitleEl: React.ReactNode = null;
  if (large) {
    const d = collapseDistance;
    const y = large.scrollY;
    // The fill and hairline arrive as the title lands.
    chromeOpacity = y.interpolate({ inputRange: [d * 0.75, d], outputRange: [0, 1], extrapolate: 'clamp' });
    // Negative offsets are the iOS pull-down: the title follows the content
    // down and, unless motion is reduced, grows a little.
    const pull = 120;
    const titleY = y.interpolate({
      inputRange: [-pull, 0, d],
      outputRange: [titleYExp + pull, titleYExp, titleYCol],
      extrapolate: 'clamp',
    });
    const titleScale = y.interpolate({
      inputRange: [-pull, 0, d],
      outputRange: [reducedMotion ? 1 : 1.08, 1, scale],
      extrapolate: 'clamp',
    });
    const subY = y.interpolate({
      inputRange: [-pull, 0, d],
      outputRange: [subYExp + pull, subYExp, subYCol],
      extrapolate: 'clamp',
    });
    const layer = { position: 'absolute' as const, top: 0, left: 0, right: 0 };
    largeTitleEl = (
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: bp.gutter, right: bp.gutter }}
      >
        <Animated.Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[
            type.display,
            layer,
            {
              color: tokens.colors.text,
              transformOrigin: 'left top',
              transform: [{ translateY: titleY }, { scale: titleScale }],
            },
          ]}
        >
          {title}
        </Animated.Text>
        {subtitle ? (
          <Animated.Text
            numberOfLines={1}
            style={[
              type.caption,
              layer,
              { color: tokens.colors.textMuted, transform: [{ translateY: subY }] },
            ]}
          >
            {subtitle}
          </Animated.Text>
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
        // The large title hangs below the bar over the scroll content, so
        // the bar paints above its sibling scroller.
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

      {large ? (
        <View style={{ flex: 1 }} />
      ) : (
        <View style={{ flex: 1 }}>
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
      )}

      {right.map((btn, idx) => renderButton(btn, 'right', idx))}
      {confirm ? renderConfirm(confirm) : null}
      {largeTitleEl}
    </View>
  );
}

/**
 * Space for a `largeTitle` header's title at rest: first child of the
 * screen's scroll content. The title itself is drawn by the header, over this
 * spacer, so it can shrink into the bar without being clipped by the
 * scroller. Renders nothing when the large title is off (medium+).
 */
export function LargeTitle({ largeTitle }: { largeTitle: LargeTitleState }) {
  if (!largeTitle.enabled) return null;
  return <View style={{ height: largeTitle.spacerHeight, marginBottom: space.s4 }} />;
}
