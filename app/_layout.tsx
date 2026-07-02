import { useEffect, useState } from 'react';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { View, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Tabs } from 'expo-router';
import Head from 'expo-router/head';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, ThemeProvider } from '../hooks/useTheme';
import { useToast, ToastProvider } from '../hooks/useToast';
import { useBudgetData, BudgetDataProvider } from '../hooks/useBudgetData';
import { useAuth } from '../hooks/useAuth';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { DesktopModalsProvider } from '../hooks/useDesktopModals';
import { setupErrorLogging } from '../utils/errorLogger';

import AuthGuard from '../components/AuthGuard';
import ToastContainer from '../components/ToastContainer';
import BottomTabBar from '../components/nav/BottomTabBar';
import NavRail from '../components/nav/NavRail';
import Sidebar from '../components/nav/Sidebar';

/**
 * Root shell (DESIGN.md §2.5–2.6):
 * - compact  (<640): bottom tab bar, always visible
 * - medium   (640–1023): left navigation rail (84px)
 * - expanded (>=1024): full sidebar (264px)
 * One layout tree; the breakpoint only changes which chrome renders.
 */

function RootLayoutContent() {
  const { tokens, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const { toasts, hideToast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const { loading: budgetLoading } = useBudgetData();
  const bp = useBreakpoint();

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

  // Web: page-level background + scrollbar + date-picker theming.
  useEffect(() => {
    if (Platform.OS === 'web') {
      const style = document.createElement('style');
      style.id = 'app-global-styles';
      style.textContent = `
        html, body {
          margin: 0;
          padding: 0;
          width: 100%;
          min-height: 100dvh;
          background-color: ${tokens.colors.bg} !important;
        }
        body { height: 100dvh; }
        #root {
          min-height: 100dvh;
          height: 100%;
          width: 100%;
          display: flex;
          flex-direction: column;
          background-color: ${tokens.colors.bg} !important;
        }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb {
          background: ${tokens.colors.borderStrong};
          border-radius: 10px;
          border: 2px solid transparent;
          background-clip: content-box;
        }
        ::-webkit-scrollbar-thumb:hover { background: ${tokens.colors.textFaint}; background-clip: content-box; }
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: ${isDarkMode ? 'invert(1) brightness(2)' : 'none'} !important;
          cursor: pointer;
        }
      `;
      document.head.appendChild(style);

      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', tokens.colors.bg);
      }

      return () => {
        document.getElementById('app-global-styles')?.remove();
      };
    }
  }, [tokens, isDarkMode]);

  const showRail = user && bp.isMedium;
  const showSidebar = user && bp.isExpanded;
  const showTabBar = bp.isCompact;

  return (
    <View
      style={{
        flex: 1,
        minHeight: '100%',
        backgroundColor: tokens.colors.bg,
        flexDirection: bp.isCompact ? 'column' : 'row',
        paddingTop: Platform.OS === 'web'
          ? (bp.isCompact ? ('env(safe-area-inset-top)' as any) : 0)
          : (bp.isCompact ? insets.top : 0),
      }}
    >
      <Head>
        <title>Budget Flow</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content={tokens.colors.bg} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </Head>

      <StatusBar
        style={isDarkMode ? 'light' : 'dark'}
        backgroundColor="transparent"
        translucent
      />

      {showSidebar && <Sidebar />}
      {showRail && <NavRail />}

      <View style={{ flex: 1, backgroundColor: 'transparent' }}>
        <AuthGuard user={user} loading={authLoading || isInitialLoad}>
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarStyle: { display: 'none' },
            }}
            tabBar={() => (showTabBar ? <BottomTabBar /> : null)}
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
        <BudgetDataProvider>
          <DesktopModalsProvider>
            <RootLayoutContent />
          </DesktopModalsProvider>
        </BudgetDataProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

// Keep the native splash visible until the Inter fonts are ready so text
// doesn't flash in the system font. Web already loads Inter via index.html.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  // On font error, proceed with the system font rather than blocking the app.
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}
