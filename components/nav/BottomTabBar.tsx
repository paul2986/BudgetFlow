import React from 'react';
import { View, Pressable, Platform, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useTheme } from '../../hooks/useTheme';
import { LAYOUT, bottomClearance, IS_IOS_SAFARI_TAB, useBottomInset, tabBarBottomOffset } from '../../hooks/useBreakpoint';
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
 * - iOS 26+: Liquid Glass material. Older iOS: `chrome` blur. Web: CSS
 *   backdrop blur. Android: opaque raised surface.
 */

// Checked once: availability is fixed for the lifetime of the process.
const USE_LIQUID_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable();

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
  const bottomInset = useBottomInset();

  const bottom = tabBarBottomOffset(bottomInset);

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

  const pill = { borderRadius: radius.full };

  return (
    <View
      pointerEvents="box-none"
      style={{
        // Safari tab: fixed to the visible page bottom, above the floating
        // toolbar. Elsewhere absolute to the shell (iOS home-screen apps
        // once anchored fixed elements to a short viewport).
        position: IS_IOS_SAFARI_TAB ? ('fixed' as any) : 'absolute',
        bottom: IS_IOS_SAFARI_TAB ? bottom : bottomClearance(bottom),
        left: space.s4,
        right: space.s4,
        zIndex: 1000,
      }}
    >
      {USE_LIQUID_GLASS ? (
        // Glass draws its own edge highlight and depth, so no hairline or
        // shadow. colorScheme follows the in-app theme, not the system.
        <GlassView
          glassEffectStyle="regular"
          colorScheme={isDarkMode ? 'dark' : 'light'}
          style={pill}
        >
          {tabs}
        </GlassView>
      ) : (
        <View
          style={[
            pill,
            {
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
                ? { backdropFilter: 'blur(12px) saturate(160%)', WebkitBackdropFilter: 'blur(12px) saturate(160%)' }
                : {}),
            },
            // Dark mode separates by surface + hairline, not shadow.
            isDarkMode ? null : elevation.e2,
          ]}
        >
          {Platform.OS === 'ios' ? (
            <BlurView intensity={60} tint={isDarkMode ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}>
              {tabs}
            </BlurView>
          ) : (
            tabs
          )}
        </View>
      )}
    </View>
  );
}
