
import { useEffect, useCallback, useMemo, useState } from 'react';
import { useTheme, ThemeProvider } from '../hooks/useTheme';
import { useToast, ToastProvider } from '../hooks/useToast';
import { useBudgetData } from '../hooks/useBudgetData';
import { StatusBar } from 'expo-status-bar';
import { Tabs, router, usePathname } from 'expo-router';
import { setupErrorLogging } from '../utils/errorLogger';
import { View, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles } from '../hooks/useThemedStyles';
import Icon from '../components/Icon';
import ToastContainer from '../components/ToastContainer';
import SideNavBar from '../components/SideNavBar';
import * as Linking from 'expo-linking';
import { useAuth } from '../hooks/useAuth';
import AuthGuard from '../components/AuthGuard';

function CustomTabBar() {
  const { currentColors } = useTheme();
  const { themedStyles } = useThemedStyles();
  const { appData, activeBudget } = useBudgetData();
  const pathname = usePathname();

  const navigateToTab = useCallback((route: string) => {
    router.replace(route as any);
  }, []);

  const tabs = useMemo(() => [
    { route: '/', icon: 'home-outline', activeIcon: 'home' },
    { route: '/people', icon: 'people-outline', activeIcon: 'people' },
    { route: '/expenses', icon: 'receipt-outline', activeIcon: 'receipt' },
    { route: '/tools', icon: 'calculator-outline', activeIcon: 'calculator' },
    { route: '/settings', icon: 'settings-outline', activeIcon: 'settings' },
  ], []);

  const shouldHideTabBar = useMemo(() => {
    // Always show tab bar on these paths, regardless of budget state
    const alwaysShowPaths = ['/expenses', '/people', '/add-expense', '/settings', '/tools', '/budgets'];
    if (alwaysShowPaths.includes(pathname)) {
      return false;
    }

    const hasNoBudgets = !appData?.budgets?.length;
    const hasNoActiveBudget = !activeBudget;

    return hasNoBudgets || hasNoActiveBudget;
  }, [appData, activeBudget, pathname]);

  if (shouldHideTabBar) {
    return null;
  }

  return (
    <View
      style={[
        themedStyles.floatingTabContainer,
        { paddingBottom: 20 },
      ]}
    >
      <View
        style={[
          themedStyles.floatingTabBar,
          {
            backgroundColor: currentColors.backgroundAlt,
            borderColor: currentColors.border,
            shadowColor: '#000',
          },
        ]}
      >
        {tabs.map((tab) => {
          const isActive = pathname === tab.route;
          const iconColor = isActive ? currentColors.primary : currentColors.text;

          return (
            <TouchableOpacity
              key={tab.route}
              style={[
                themedStyles.floatingTabItem,
                isActive && { backgroundColor: `${currentColors.primary}15` },
              ]}
              onPress={() => navigateToTab(tab.route)}
              activeOpacity={0.7}
            >
              <Icon
                name={isActive ? (tab.activeIcon as any) : (tab.icon as any)}
                size={26}
                style={{ color: iconColor }}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function RootLayoutContent() {
  const { currentColors, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const { toasts, hideToast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const { appData, activeBudget, data, loading: budgetLoading } = useBudgetData();
  const pathname = usePathname();

  const loading = authLoading || (user && budgetLoading);

  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    if (!loading && isInitialLoad) {
      const timer = setTimeout(() => setIsInitialLoad(false), 100);
      return () => clearTimeout(timer);
    }
  }, [loading, isInitialLoad]);

  useEffect(() => {
    setupErrorLogging();
  }, []);

  const pageState = useMemo(() => {
    if (isInitialLoad || loading) return 'loading';
    if (pathname !== '/') return 'normal';

    const hasNoBudgets = !appData?.budgets?.length;
    const hasNoActiveBudget = !activeBudget;

    if (hasNoBudgets || hasNoActiveBudget) return 'welcome';

    if (activeBudget && data) {
      const people = data?.people || [];
      const expenses = data?.expenses || [];

      if (people.length === 0 || expenses.length === 0) return 'guidance';
    }

    return 'normal';
  }, [isInitialLoad, loading, pathname, appData, activeBudget, data]);

  // Manual deep link handling removed to prevent conflicts with Expo Router
  // Expo Router handles deep links automatically based on file structure

  const safeZoneBackgroundColor = useMemo(() => {
    switch (pageState) {
      case 'loading':
      case 'guidance':
      case 'normal':
        return currentColors.backgroundAlt;
      case 'welcome':
        return currentColors.background;
      default:
        return currentColors.backgroundAlt;
    }
  }, [pageState, currentColors]);

  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  return (
    <View style={{ flex: 1, backgroundColor: safeZoneBackgroundColor, flexDirection: isDesktop ? 'row' : 'column' }}>
      <StatusBar
        style={isDarkMode ? 'light' : 'dark'}
        backgroundColor={safeZoneBackgroundColor}
      />

      {/* For mobile, we push content down by status bar height. For desktop, this is usually 0 or handled by window frame */}
      {!isDesktop && <View style={{ height: insets.top, backgroundColor: safeZoneBackgroundColor }} />}

      {isDesktop && <SideNavBar />}

      <View style={{ flex: 1, backgroundColor: currentColors.background }}>
        <AuthGuard user={user} loading={authLoading}>
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarStyle: { display: 'none' },
            }}
            tabBar={() => isDesktop ? null : <CustomTabBar />}
          >
            <Tabs.Screen name="index" />
            <Tabs.Screen name="people" />
            <Tabs.Screen name="expenses" />
            <Tabs.Screen name="settings" />
            <Tabs.Screen name="add-expense" options={{ href: null }} />
            <Tabs.Screen name="edit-person" options={{ href: null }} />
            <Tabs.Screen name="edit-income" options={{ href: null }} />
            <Tabs.Screen name="budgets" options={{ href: null }} />
            <Tabs.Screen name="tools" />
            <Tabs.Screen name="import-link" options={{ href: null }} />
            <Tabs.Screen name="import-budget" options={{ href: null }} />
            <Tabs.Screen name="budget-lock" options={{ href: null }} />
            <Tabs.Screen name="manage-categories" options={{ href: null }} />
            <Tabs.Screen name="auth/index" options={{ href: null }} />
            <Tabs.Screen name="auth/callback" options={{ href: null }} />
            <Tabs.Screen name="auth/debug" options={{ href: null }} />
            <Tabs.Screen name="auth/email" options={{ href: null }} />
            <Tabs.Screen name="auth/lock" options={{ href: null }} />
            <Tabs.Screen name="auth/verify" options={{ href: null }} />
          </Tabs>
        </AuthGuard>

        <ToastContainer toasts={toasts} onHideToast={hideToast} />
      </View>
    </View>
  );
}

function AppContent() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <RootLayoutContent />
      </ToastProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}
