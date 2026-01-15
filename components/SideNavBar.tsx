import { View, Text, TouchableOpacity, ScrollView, Platform, Pressable } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useBudgetData } from '../hooks/useBudgetData';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';
import { useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';

// Helper Components
const NavItem = ({
  tab,
  isActive,
  onPress,
  currentColors
}: {
  tab: any,
  isActive: boolean,
  onPress: () => void,
  currentColors: any
}) => {
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      // @ts-ignore
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        marginBottom: 4,
        backgroundColor: isActive
          ? currentColors.primary + '15'
          : (hovered ? currentColors.backgroundAlt + '80' : 'transparent'), // subtle hover bg
        transform: (Platform.OS === 'web' && hovered) ? [{ translateX: 4 }] : [],
        transitionDuration: '0.2s',
      }}
    >
      <View style={{
        width: 32,
        alignItems: 'center',
        marginRight: 12
      }}>
        <Icon
          name={isActive ? (tab.activeIcon as any) : (tab.icon as any)}
          size={24}
          style={{
            color: isActive
              ? currentColors.primary
              : (hovered ? currentColors.text : currentColors.textSecondary)
          }}
        />
      </View>
      <Text style={{
        fontSize: 16,
        fontWeight: isActive ? '700' : '500',
        color: isActive
          ? currentColors.primary
          : (hovered ? currentColors.text : currentColors.textSecondary),
      }}>
        {tab.label}
      </Text>
    </Pressable>
  );
};

const QuickActionButton = ({
  label,
  icon,
  iconColor,
  onPress,
  currentColors
}: {
  label: string,
  icon: string,
  iconColor: string,
  onPress: () => void,
  currentColors: any
}) => {
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      // @ts-ignore
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        marginBottom: 4,
        backgroundColor: hovered ? currentColors.background + '80' : currentColors.background,
        borderWidth: 1,
        borderColor: hovered ? currentColors.primary : currentColors.border,
        transform: (Platform.OS === 'web' && hovered) ? [{ scale: 1.02 }] : [],
        transitionDuration: '0.2s',
      }}
    >
      <Icon name={icon as any} size={20} style={{ color: iconColor, marginRight: 12 }} />
      <Text style={{ fontSize: 14, fontWeight: '600', color: currentColors.text }}>
        {label}
      </Text>
    </Pressable>
  );
};


export default function SideNavBar() {
  const { currentColors, isDarkMode } = useTheme();
  const { appData, activeBudget } = useBudgetData();
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [userHovered, setUserHovered] = useState(false);
  const { signOut, user } = useAuth();

  const tabs = useMemo(() => [
    { route: '/', label: 'Overview', icon: 'home-outline', activeIcon: 'home' },
    { route: '/expenses', label: 'Expenses', icon: 'receipt-outline', activeIcon: 'receipt' },
    { route: '/people', label: 'People', icon: 'people-outline', activeIcon: 'people' },
    { route: '/tools', label: 'Tools', icon: 'calculator-outline', activeIcon: 'calculator' },
    { route: '/settings', label: 'Settings', icon: 'settings-outline', activeIcon: 'settings' },
  ], []);

  const shouldHideNav = useMemo(() => {
    // Always show nav bar on these paths, regardless of budget state
    const alwaysShowPaths = ['/expenses', '/people', '/add-expense', '/settings', '/tools', '/budgets'];
    if (alwaysShowPaths.includes(pathname)) {
      return false;
    }

    const hasNoBudgets = !appData?.budgets?.length;
    const hasNoActiveBudget = !activeBudget;

    return hasNoBudgets || hasNoActiveBudget;
  }, [appData, activeBudget, pathname]);

  if (shouldHideNav) {
    return null;
  }

  return (
    <View
      style={{
        width: 280,
        backgroundColor: currentColors.backgroundAlt,
        borderRightWidth: 1,
        borderRightColor: currentColors.border,
        height: '100%',
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <View style={{ padding: 24, paddingBottom: 12 }}>
        <Text style={{
          fontSize: 24,
          fontWeight: '800',
          color: currentColors.primary,
          marginBottom: 4,
          letterSpacing: -0.5
        }}>
          Budget Flow
        </Text>
        <Text style={{
          fontSize: 14,
          color: currentColors.textSecondary,
          fontWeight: '500'
        }}>
          {activeBudget?.name || 'Personal Finance'}
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
        {tabs.map((tab) => (
          <NavItem
            key={tab.route}
            tab={tab}
            isActive={pathname === tab.route}
            onPress={() => router.replace(tab.route as any)}
            currentColors={currentColors}
          />
        ))}

        {/* Quick Actions Section */}
        <View style={{ marginTop: 24, paddingHorizontal: 12 }}>
          <Text style={{
            fontSize: 12,
            fontWeight: '700',
            color: currentColors.textSecondary,
            textTransform: 'uppercase',
            marginBottom: 12,
            letterSpacing: 1
          }}>
            Quick Actions
          </Text>

          <QuickActionButton
            label="Add Expense"
            icon="add-circle"
            iconColor={currentColors.primary}
            onPress={() => router.push('/add-expense')}
            currentColors={currentColors}
          />

          <QuickActionButton
            label="Switch Budget"
            icon="wallet-outline"
            iconColor={currentColors.secondary}
            onPress={() => router.push('/budgets')}
            currentColors={currentColors}
          />
        </View>
      </ScrollView>

      <View style={{ padding: 24, borderTopWidth: 1, borderTopColor: currentColors.border }}>
        <Pressable
          // @ts-ignore
          onHoverIn={() => setUserHovered(true)}
          onHoverOut={() => setUserHovered(false)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            opacity: userHovered ? 0.8 : 1,
            transform: (Platform.OS === 'web' && userHovered) ? [{ translateX: 2 }] : [],
            transitionDuration: '0.2s',
          }}
          onPress={async () => {
            if (Platform.OS === 'web') {
              const confirmed = (window as any).confirm('Are you sure you want to sign out?');
              if (confirmed) {
                await signOut();
                router.replace('/');
              }
            } else {
              // This component is mostly used on desktop web, but just in case
              await signOut();
            }
          }}
        >
          <View style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: currentColors.error + '15',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12
          }}>
            <Icon name="log-out-outline" size={20} style={{ color: currentColors.error }} />
          </View>
          <View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: currentColors.text }}>
              Log Out
            </Text>
            <Text style={{ fontSize: 12, color: currentColors.textSecondary }} numberOfLines={1}>
              {user?.email || 'Sign out of account'}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}
