import { View, Pressable, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';
import { LAYOUT, bottomClearance, IS_IOS_SAFARI_TAB, useBottomInset, tabBarBottomOffset } from '../../hooks/useBreakpoint';
import { releaseDiscardGuard } from '../../hooks/useDiscardGuard';
import Icon from '../Icon';
import { space, radius } from '../../styles/tokens';
import { NAV_TABS, isTabActive } from './navConfig';
import GlassPanel from './GlassPanel';

/**
 * Compact-class bottom tab bar (DESIGN.md §2.6), as a floating pill.
 * - Icon-only (labels live in accessibilityLabel); selection is carried by
 *   tint, a filled icon and a capsule, never color alone.
 * - Never hidden: sub-screens and empty states keep primary navigation.
 * - Floats inside the home-indicator zone (like iOS 26 / Instagram) rather
 *   than stacking a full safe-area band under a flat bar.
 * - Material: GlassPanel (Liquid Glass / blur / backdrop blur), shared with
 *   the sidebar.
 */

function TabItem({
  label,
  icon,
  activeIcon,
  active,
  onPress,
}: {
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
          onPress={() => releaseDiscardGuard(() => router.navigate(tab.route as any))}
        />
      ))}
    </View>
  );

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
      <GlassPanel borderRadius={radius.full}>{tabs}</GlassPanel>
    </View>
  );
}
