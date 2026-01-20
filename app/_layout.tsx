
import { useEffect, useCallback, useMemo, useState } from 'react';
import { useTheme, ThemeProvider } from '../hooks/useTheme';
import { useToast, ToastProvider } from '../hooks/useToast';
import { useBudgetData } from '../hooks/useBudgetData';
import { StatusBar } from 'expo-status-bar';
import { Tabs, router, usePathname } from 'expo-router';
import { setupErrorLogging } from '../utils/errorLogger';
import { View, TouchableOpacity, useWindowDimensions, Platform, Text } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles } from '../hooks/useThemedStyles';
import Icon from '../components/Icon';
import ToastContainer from '../components/ToastContainer';
import SideNavBar from '../components/SideNavBar';
import * as Linking from 'expo-linking';
import { useAuth } from '../hooks/useAuth';
import AuthGuard from '../components/AuthGuard';
import { BlurView } from 'expo-blur';

import Head from 'expo-router/head';

function CustomTabBar() {
  const { currentColors, isDarkMode } = useTheme();
  const { themedStyles } = useThemedStyles();
  const { appData, activeBudget } = useBudgetData();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const navigateToTab = useCallback((route: string) => {
    router.replace(route as any);
  }, []);

  const tabs = useMemo(() => [
    { route: '/', icon: 'home-outline', activeIcon: 'home', label: 'Home' },
    { route: '/people', icon: 'people-outline', activeIcon: 'people', label: 'People' },
    { route: '/expenses', icon: 'receipt-outline', activeIcon: 'receipt', label: 'Expenses' },
    { route: '/tools', icon: 'calculator-outline', activeIcon: 'calculator', label: 'Tools' },
    { route: '/settings', icon: 'settings-outline', activeIcon: 'settings', label: 'Settings' },
  ], []);

  const isIOS = useMemo(() => {
    if (Platform.OS === 'ios') return true;
    if (Platform.OS === 'web') {
      return /iPhone|iPad|iPod/.test(navigator.userAgent);
    }
    return false;
  }, []);

  const shouldHideTabBar = useMemo(() => {
    const alwaysShowPaths = ['/expenses', '/people', '/settings', '/tools', '/budgets'];
    if (alwaysShowPaths.includes(pathname)) return false;
    if (pathname === '/') {
      return !appData?.budgets?.length || !activeBudget;
    }
    return true; // Hide on subpages like add-expense
  }, [appData, activeBudget, pathname]);

  if (shouldHideTabBar) return null;

  const renderTabContent = () => (
    <View style={[
      isIOS ? themedStyles.iosTabBar : themedStyles.androidTabBar,
      {
        backgroundColor: Platform.OS === 'web'
          ? (isDarkMode ? 'rgba(15, 23, 42, 0)' : 'rgba(255, 255, 255, 0)')
          : (isIOS
            ? (isDarkMode ? 'rgba(26, 35, 50, 0.6)' : 'rgba(255, 255, 255, 0.7)')
            : currentColors.backgroundAlt),
        borderColor: currentColors.border,
        // Extend padding to cover the entire bottom safe area
        paddingBottom: Platform.OS === 'web'
          ? 'env(safe-area-inset-bottom)' as any
          : Math.max(insets.bottom, 12),
        // Ensure proper vertical alignment
        alignItems: Platform.OS === 'web' ? 'flex-start' : undefined,
        paddingTop: Platform.OS === 'web' ? 12 : (isIOS ? 8 : 6),
      }
    ]}>
      {tabs.map((tab) => {
        const isActive = pathname === tab.route;
        const iconColor = isActive ? currentColors.primary : currentColors.textSecondary;

        return (
          <TouchableOpacity
            key={tab.route}
            style={[
              themedStyles.nativeTabItem,
              isActive && !isIOS && Platform.OS !== 'web' && { backgroundColor: `${currentColors.primary}10` },
            ]}
            onPress={() => navigateToTab(tab.route)}
            activeOpacity={0.7}
          >
            <Icon
              name={isActive ? (tab.activeIcon as any) : (tab.icon as any)}
              size={isIOS ? 26 : 24}
              style={{ color: iconColor }}
            />
            {!isIOS && Platform.OS !== 'web' && (
              <Text style={{
                fontSize: 11,
                marginTop: 4,
                color: iconColor,
                fontWeight: isActive ? '700' : '500'
              }}>
                {tab.label}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <View style={[
      themedStyles.nativeTabContainer,
      Platform.OS === 'web' && {
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      } as any
    ]}>
      {(isIOS && Platform.OS !== 'web') ? (
        <BlurView
          intensity={80}
          tint={isDarkMode ? 'dark' : 'light'}
          style={{ width: '100%' }}
        >
          {renderTabContent()}
        </BlurView>
      ) : (
        renderTabContent()
      )}
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
    if (!user) return 'auth';
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

  const safeZoneBackgroundColor = useMemo(() => {
    switch (pageState) {
      case 'loading':
      case 'guidance':
      case 'normal':
        return currentColors.backgroundAlt; // Match top bar to header
      case 'welcome':
      case 'auth':
        return currentColors.background; // Match top bar to background
      default:
        return currentColors.backgroundAlt;
    }
  }, [pageState, currentColors]);

  const bottomSafeZoneColor = useMemo(() => {
    return currentColors.backgroundAlt; // Match bottom bar to nav bar
  }, [currentColors]);

  // Inject global styles to fix Safari scroll and background issues
  useEffect(() => {
    if (Platform.OS === 'web') {
      const style = document.createElement('style');
      style.id = 'safari-fix-styles';
      style.textContent = `
        html {
          margin: 0;
          padding: 0;
          width: 100%;
          background-color: ${currentColors.background} !important;
        }
        body { 
          margin: 0;
          padding: 0;
          width: 100%;
          min-height: 100dvh;
          background-color: ${currentColors.background} !important;
        }
        #root {
          min-height: 100dvh;
          width: 100%;
          display: flex;
          flex-direction: column;
          background-color: ${currentColors.background} !important;
        }
        /* Fancy Scrollbar */
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: ${currentColors.primary}60;
          border-radius: 10px;
          border: 2px solid transparent;
          background-clip: content-box;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: ${currentColors.primary};
          background-clip: content-box;
        }
        /* Global Date Picker Icon Fix */
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: ${isDarkMode ? 'invert(1) brightness(2)' : 'none'} !important;
          cursor: pointer;
        }
      `;
      document.head.appendChild(style);

      // Update theme-color meta tag dynamically
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', safeZoneBackgroundColor);
      }

      return () => {
        const existing = document.getElementById('safari-fix-styles');
        if (existing) existing.remove();
      };
    }
  }, [safeZoneBackgroundColor, bottomSafeZoneColor, currentColors.background, currentColors.primary, isDarkMode]);

  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  return (
    <View style={{
      flex: 1,
      minHeight: '100%',
      backgroundColor: safeZoneBackgroundColor, // Always use safe zone color which matches header
      flexDirection: isDesktop ? 'row' : 'column',
      paddingTop: Platform.OS === 'web'
        ? (isDesktop ? 0 : 'env(safe-area-inset-top)') as any
        : (!isDesktop ? insets.top : 0),
      paddingBottom: (!isDesktop && Platform.OS !== 'web') ? insets.bottom : 0,
    }}>
      <Head>
        <title>Budget Flow</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
        <meta name="theme-color" content={safeZoneBackgroundColor} />
        <meta name="theme-color" content={safeZoneBackgroundColor} media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content={safeZoneBackgroundColor} media="(prefers-color-scheme: dark)" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </Head>

      <StatusBar
        style={isDarkMode ? 'light' : 'dark'}
        backgroundColor="transparent"
        translucent
      />

      {isDesktop && user && <SideNavBar />}

      <View style={{
        flex: 1,
        backgroundColor: Platform.OS === 'web' ? 'transparent' : currentColors.background,
        paddingBottom: 0,
      }}>
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


import { DesktopModalsProvider } from '../hooks/useDesktopModals';
import { BudgetDataProvider } from '../hooks/useBudgetData';

function AppContent() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BudgetDataProvider>
          <DesktopModalsProvider>
            <RootLayoutContent />
          </DesktopModalsProvider>
        </BudgetDataProvider>
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
