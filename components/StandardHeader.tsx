import React from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useBreakpoint } from '../hooks/useBreakpoint';
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
  leftIcon = 'arrow-back',
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
}: StandardHeaderProps) {
  const { tokens } = useTheme();
  const bp = useBreakpoint();

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
          backgroundColor: pressed || hovered ? tokens.colors.surfaceSunken : bg,
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

  const left = leftButtons && leftButtons.length > 0
    ? leftButtons
    : showLeftIcon && onLeftPress
      ? [{ icon: leftIcon, onPress: onLeftPress, iconColor: leftIconColor }]
      : [];
  const right = rightButtons && rightButtons.length > 0
    ? rightButtons
    : showRightIcon && onRightPress
      ? [{ icon: rightIcon, onPress: onRightPress, iconColor: rightIconColor }]
      : [];

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: subtitle ? HEADER_HEIGHT + 12 : HEADER_HEIGHT,
        paddingHorizontal: bp.gutter,
        paddingVertical: space.s2,
        backgroundColor: backgroundColor || tokens.colors.bg,
        borderBottomWidth: 1,
        borderBottomColor: tokens.colors.border,
        // @ts-ignore web-only sticky header
        ...(Platform.OS === 'web' ? { position: 'sticky', top: 0, zIndex: 100 } : {}),
      }}
    >
      {left.map((btn, idx) => renderButton(btn, 'left', idx))}

      <View style={{ flex: 1, marginLeft: left.length ? 0 : 0 }}>
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

      {right.map((btn, idx) => renderButton(btn, 'right', idx))}
    </View>
  );
}
