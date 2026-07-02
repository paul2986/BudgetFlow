import React, { useState } from 'react';
import { View, Text, Pressable, Image, ScrollView } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import { useBudgetData } from '../../hooks/useBudgetData';
import { LAYOUT } from '../../hooks/useBreakpoint';
import Icon from '../Icon';
import Button from '../Button';
import { Avatar, ConfirmDialog } from '../ui';
import { type, space, radius } from '../../styles/tokens';
import { NAV_TABS, isTabActive } from './navConfig';

/**
 * Expanded-class (desktop) sidebar, 264px (DESIGN.md §2.6).
 * Sections: brand + budget switcher, nav list, primary add action,
 * account footer with an in-app themed sign-out confirmation
 * (replaces window.confirm).
 */

function NavItem({ tab, active, onPress }: { tab: (typeof NAV_TABS)[number]; active: boolean; onPress: () => void }) {
  const { tokens } = useTheme();
  const color = active ? tokens.colors.onBrandSubtle : tokens.colors.textMuted;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: active }}
      style={({ pressed, hovered }: any) => ({
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 44,
        paddingHorizontal: space.s3,
        borderRadius: radius.md,
        marginBottom: 2,
        backgroundColor: active
          ? tokens.colors.brandSubtle
          : hovered || pressed
            ? tokens.colors.surfaceSunken
            : 'transparent',
        // @ts-ignore web transition
        transitionDuration: '150ms',
      })}
    >
      <Icon name={(active ? tab.activeIcon : tab.icon) as any} size={20} color={color} />
      <Text
        style={[
          active ? type.bodyMed : type.body,
          { color: active ? tokens.colors.onBrandSubtle : tokens.colors.text, marginLeft: space.s3 },
        ]}
      >
        {tab.label}
      </Text>
    </Pressable>
  );
}

export default function Sidebar() {
  const { tokens } = useTheme();
  const { user, signOut } = useAuth();
  const { activeBudget } = useBudgetData();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  return (
    <View
      style={{
        width: LAYOUT.sidebarWidth,
        backgroundColor: tokens.colors.surface,
        borderRightWidth: 1,
        borderRightColor: tokens.colors.border,
        height: '100%',
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      {/* Brand + budget switcher */}
      <View style={{ padding: space.s5, paddingBottom: space.s3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.s4 }}>
          <Image
            source={require('../../assets/images/icon.png')}
            style={{ width: 32, height: 32, borderRadius: radius.sm, marginRight: space.s3 }}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
          <Text style={[type.h3, { color: tokens.colors.text }]}>Budget Flow</Text>
        </View>

        <Pressable
          onPress={() => router.push('/budgets')}
          accessibilityRole="button"
          accessibilityLabel={`Switch budget. Current budget: ${activeBudget?.name || 'none'}`}
          style={({ pressed, hovered }: any) => ({
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 44,
            paddingHorizontal: space.s3,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: tokens.colors.border,
            backgroundColor: hovered || pressed ? tokens.colors.surfaceSunken : 'transparent',
          })}
        >
          <Icon name="wallet-outline" size={18} color={tokens.colors.textMuted} />
          <Text
            style={[type.bodyMed, { color: tokens.colors.text, flex: 1, marginLeft: space.s2 }]}
            numberOfLines={1}
          >
            {activeBudget?.name || 'Select budget'}
          </Text>
          <Icon name="chevron-expand-outline" size={16} color={tokens.colors.textFaint} />
        </Pressable>
      </View>

      {/* Destinations */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: space.s3 }}>
        {NAV_TABS.map((tab) => (
          <NavItem
            key={tab.route}
            tab={tab}
            active={isTabActive(pathname, tab.route)}
            onPress={() => router.navigate(tab.route as any)}
          />
        ))}

        <View style={{ marginTop: space.s5, paddingHorizontal: space.s1 }}>
          <Button
            text="Add expense"
            onPress={() => router.push('/add-expense')}
            variant="primary"
            icon={<Icon name="add" size={18} color={tokens.colors.onBrand} />}
          />
        </View>
      </ScrollView>

      {/* Account footer */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: tokens.colors.border,
          padding: space.s4,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Avatar name={user?.email || '?'} seed={user?.id} size={36} />
        <View style={{ flex: 1, marginLeft: space.s3, marginRight: space.s2 }}>
          <Text style={[type.caption, { color: tokens.colors.text }]} numberOfLines={1}>
            {user?.email || 'Signed in'}
          </Text>
        </View>
        <Pressable
          onPress={() => setConfirmSignOut(true)}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed, hovered }: any) => ({
            width: 36,
            height: 36,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: hovered || pressed ? tokens.colors.dangerSubtle : 'transparent',
          })}
        >
          <Icon name="log-out-outline" size={20} color={tokens.colors.danger} />
        </Pressable>
      </View>

      <ConfirmDialog
        visible={confirmSignOut}
        title="Sign out?"
        message="Local data on this device will be cleared. Your budgets stay safely synced to your account."
        confirmLabel="Sign out"
        destructive
        loading={signingOut}
        onConfirm={async () => {
          setSigningOut(true);
          try {
            await signOut();
          } finally {
            setSigningOut(false);
            setConfirmSignOut(false);
          }
        }}
        onCancel={() => setConfirmSignOut(false)}
      />
    </View>
  );
}
