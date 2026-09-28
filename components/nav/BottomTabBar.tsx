import React from 'react';
import { View, Pressable, Platform, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../hooks/useTheme';
import { LAYOUT } from '../../hooks/useBreakpoint';
import Icon from '../Icon';
import { space, radius, elevation } from '../../styles/tokens';
import { NAV_TABS, isTabActive } from './navConfig';

/**
 * Compact-class bottom tab bar (DESIGN.md §2.6), as a floating pill.
 * - Icon-only (labels live in accessibilityLabel); selection is carried by
 *   tint, a filled icon and a capsule, never color alone.
 * - Never hidden: sub-screens and empty states keep primary navigation.
 * - Floats inside the home-indicator zone (like iOS 26 / Instagram) rather
 *   than stacking a full safe-area band under a flat bar.
 * - Translucent `chrome` material with blur so content passes underneath.
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
        borderRadius: radius.full,
        backgroundColor: active ? tokens.colors.brandSubtle : 'transparent',
        opacity: pressed ? 0.6 : 1,
        minHeight: LAYOUT.tabBarHeight - space.s2,
      })}
    >
      <Icon name={(active ? activeIcon : icon) as any} size={26} color={color} />
    </Pressable>
  );
}

export default function BottomTabBar() {
  const { tokens, isDarkMode } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  // Sit inside the home-indicator zone rather than above it; devices without
  // an inset still get a small float gap.
  const bottom = Math.max(insets.bottom - space.s3, space.s3);

  const tabs = (
    <View
      accessibilityRole={Platform.OS === 'web' ? ('tablist' as any) : undefined}
      style={{ flexDirection: 'row', padding: space.s1 }}
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
      pointerEvents="box-none"
      style={{
        // Absolute (not fixed) on web too, so it tracks the app shell's
        // bottom edge rather than the browser's layout viewport.
        position: 'absolute',
        bottom,
        left: space.s4,
        right: space.s4,
        zIndex: 1000,
      }}
    >
      <View
        style={[
          {
            borderRadius: radius.full,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: tokens.colors.borderStrong,
            overflow: Platform.OS === 'ios' ? 'hidden' : 'visible',
            backgroundColor:
              Platform.OS === 'android'
                ? tokens.colors.surfaceRaised
                : Platform.OS === 'ios'
                  ? 'transparent' // BlurView supplies the material
                  : tokens.colors.chrome,
            // @ts-ignore web blur
            ...(Platform.OS === 'web'
              ? { backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)' }
              : {}),
          },
          // Dark mode separates by surface + hairline, not shadow.
          isDarkMode ? null : elevation.e2,
        ]}
      >
        {Platform.OS === 'ios' ? (
          <BlurView intensity={80} tint={isDarkMode ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}>
            {tabs}
          </BlurView>
        ) : (
          tabs
        )}
      </View>
    </View>
  );
}
