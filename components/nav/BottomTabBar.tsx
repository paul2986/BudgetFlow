import React from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../hooks/useTheme';
import { LAYOUT } from '../../hooks/useBreakpoint';
import Icon from '../Icon';
import { type, space } from '../../styles/tokens';
import { NAV_TABS, isTabActive } from './navConfig';

/**
 * Compact-class bottom tab bar (DESIGN.md §2.6).
 * - Icons AND labels on every platform (fixes iOS icon-only tabs).
 * - Never hidden: sub-screens and empty states keep primary navigation.
 * - 56px + safe area; translucent `chrome` material with blur (iOS/web) so
 *   content visibly passes underneath, over a hairline top edge.
 * - Selection is carried by tint + filled icon; labels stay sentence case.
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
        opacity: pressed ? 0.6 : 1,
        minHeight: LAYOUT.tabBarHeight,
      })}
    >
      <Icon name={(active ? activeIcon : icon) as any} size={24} color={color} />
      <Text
        style={[type.overline, { color, marginTop: space.s1, textTransform: 'none', letterSpacing: 0 }]}
        numberOfLines={1}
      >
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
        paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 0 : space.s2),
        borderTopColor: tokens.colors.borderStrong,
        backgroundColor:
          Platform.OS === 'android'
            ? tokens.colors.surface
            : Platform.OS === 'ios'
              ? 'transparent' // BlurView supplies the material
              : tokens.colors.chrome,
        // @ts-ignore web blur
        ...(Platform.OS === 'web'
          ? { backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)' }
          : {}),
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
        // Absolute (not fixed) on web too: iOS standalone PWAs anchor fixed
        // elements to a viewport that is short by the status-bar height.
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
      }}
    >
      {Platform.OS === 'ios' ? (
        <BlurView intensity={80} tint={isDarkMode ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}>
          {content}
        </BlurView>
      ) : (
        content
      )}
    </View>
  );
}
