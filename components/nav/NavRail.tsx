import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { LAYOUT } from '../../hooks/useBreakpoint';
import Icon from '../Icon';
import { type, space, radius } from '../../styles/tokens';
import { NAV_TABS, isTabActive } from './navConfig';

/**
 * Medium-class (tablet) navigation rail, 84px (DESIGN.md §2.6).
 * Icon + stacked 12px label per destination; "+ Expense" action pinned at
 * the bottom. Replaces the old behavior of squeezing the 280px desktop
 * sidebar onto tablet portrait.
 */

export default function NavRail() {
  const { tokens } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        width: LAYOUT.railWidth,
        backgroundColor: tokens.colors.surface,
        borderRightWidth: 1,
        borderRightColor: tokens.colors.border,
        paddingTop: insets.top + space.s4,
        paddingBottom: insets.bottom + space.s4,
        alignItems: 'center',
      }}
    >
      <View style={{ flex: 1, width: '100%' }}>
        {NAV_TABS.map((tab) => {
          const active = isTabActive(pathname, tab.route);
          const color = active ? tokens.colors.brand : tokens.colors.textMuted;
          return (
            <Pressable
              key={tab.route}
              onPress={() => router.navigate(tab.route as any)}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
              style={({ pressed, hovered }: any) => ({
                alignItems: 'center',
                paddingVertical: space.s3,
                marginHorizontal: space.s2,
                marginBottom: space.s1,
                borderRadius: radius.md,
                backgroundColor: active
                  ? tokens.colors.brandSubtle
                  : hovered || pressed
                    ? tokens.colors.surfaceSunken
                    : 'transparent',
                minHeight: 56,
                justifyContent: 'center',
              })}
            >
              <Icon name={(active ? tab.activeIcon : tab.icon) as any} size={24} color={color} />
              <Text style={[type.overline, { color, marginTop: space.s1, letterSpacing: 0.2 }]} numberOfLines={1}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => router.push('/add-expense')}
        accessibilityRole="button"
        accessibilityLabel="Add expense"
        style={({ pressed, hovered }: any) => ({
          width: 48,
          height: 48,
          borderRadius: radius.full,
          backgroundColor: tokens.colors.brand,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : hovered ? 0.92 : 1,
        })}
      >
        <Icon name="add" size={24} color={tokens.colors.onBrand} />
      </Pressable>
      <Text style={[type.overline, { color: tokens.colors.textMuted, marginTop: space.s1, letterSpacing: 0.2 }]}>
        Expense
      </Text>
    </View>
  );
}
