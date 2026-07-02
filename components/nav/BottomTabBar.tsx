import React from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../hooks/useTheme';
import { LAYOUT } from '../../hooks/useBreakpoint';
import Icon from '../Icon';
import { type, space, radius } from '../../styles/tokens';
import { NAV_TABS, isTabActive } from './navConfig';

/**
 * Compact-class bottom tab bar (DESIGN.md §2.6).
 * - Icons AND labels on every platform (fixes iOS icon-only tabs).
 * - Never hidden: sub-screens and empty states keep primary navigation.
 * - 56px + safe area; surface with blur (iOS/web) over a hairline top border.
 */

function TabItem({
  route,
  label,
  icon,
  activeIcon,
  active,
  onPress,
}: {
  route: string;
  label: string;
  icon: string;
  activeIcon: string;
  active: boolean;
  onPress: () => void;
}) {
  const { tokens } = useTheme();
  const color = active ? tokens.colors.brand : tokens.colors.textMuted;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: space.s2,
        paddingBottom: space.s1,
        opacity: pressed ? 0.7 : 1,
        minHeight: LAYOUT.tabBarHeight,
      })}
    >
      <View
        style={{
          width: 4,
          height: 4,
          borderRadius: radius.full,
          backgroundColor: active ? tokens.colors.brand : 'transparent',
          marginBottom: 2,
        }}
      />
      <Icon name={(active ? activeIcon : icon) as any} size={24} color={color} />
      <Text style={[type.overline, { color, marginTop: 2, letterSpacing: 0.2 }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function BottomTabBar() {
  const { tokens, isDarkMode } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const content = (
    <View
      accessibilityRole={Platform.OS === 'web' ? ('tablist' as any) : undefined}
      style={{
        flexDirection: 'row',
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: tokens.colors.border,
        paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 0 : space.s2),
        backgroundColor:
          Platform.OS === 'android'
            ? tokens.colors.surface
            : tokens.isDark
              ? 'rgba(21,30,46,0.92)'
              : 'rgba(255,255,255,0.92)',
        // @ts-ignore web blur
        ...(Platform.OS === 'web' ? { backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } : {}),
      }}
    >
      {NAV_TABS.map((tab) => (
        <TabItem
          key={tab.route}
          {...tab}
          active={isTabActive(pathname, tab.route)}
          onPress={() => router.navigate(tab.route as any)}
        />
      ))}
    </View>
  );

  return (
    <View
      style={{
        position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
      }}
    >
      {Platform.OS === 'ios' ? (
        <BlurView intensity={80} tint={isDarkMode ? 'dark' : 'light'}>
          {content}
        </BlurView>
      ) : (
        content
      )}
    </View>
  );
}
