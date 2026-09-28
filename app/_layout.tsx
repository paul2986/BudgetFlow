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
import { setupErrorLogging } from '../utils/errorLogger';

import AuthGuard from '../components/AuthGuard';
import ToastContainer from '../components/ToastContainer';
import DialogHost from '../components/DialogHost';
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
          height: var(--app-height, 100dvh);
          background-color: ${tokens.colors.bg} !important;
        }
        #root {
          height: var(--app-height, 100dvh);
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
        /* One brand focus ring instead of the UA ring in the OS accent color.
           :where() keeps specificity at 0 so components that draw their own
           ring (ui/Input) can switch this off with a plain style. */
        :where(input, textarea, select):focus-visible {
          outline: 2px solid ${tokens.colors.brand};
          outline-offset: 1px;
        }
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: ${isDarkMode ? 'invert(1) brightness(2)' : 'none'} !important;
          cursor: pointer;
        }
      `;
      document.head.appendChild(style);

      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', user ? tokens.colors.surface : tokens.colors.bg);
      }

      return () => {
        document.getElementById('app-global-styles')?.remove();
      };
    }
  }, [tokens, isDarkMode, user]);

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
        paddingTop: Platform.OS === 'web' ? 0 : bp.isCompact ? insets.top : 0,
      }}
    >
      {Platform.OS === 'web' && bp.isCompact ? (
        // Status-bar band, painted in the header's surface so status bar
        // and header read as one bar; the auth screens have no header, so
        // they keep the page bg.
        <View
          style={{
            height: 'env(safe-area-inset-top)' as any,
            backgroundColor: user ? tokens.colors.surface : 'transparent',
          }}
        />
      ) : null}
      {Platform.OS === 'web' ? (
        // iOS 27 home-screen apps draw a Liquid Glass blur that ramps well
        // below the status bar. WebKit swaps it for a flat fill when a fixed
        // element with a real height and an opaque background-color touches
        // the top edge. It has to be a real element (a ::before pseudo-element
        // didn't take on device). Zero-height wherever there's no top inset.
        <View
          pointerEvents="none"
          aria-hidden
          style={{
            position: 'fixed' as any,
            top: 0,
            left: 0,
            right: 0,
            height: 'env(safe-area-inset-top)' as any,
            backgroundColor: user ? tokens.colors.surface : tokens.colors.bg,
            zIndex: 2147483647,
          }}
        />
      ) : null}
      <Head>
        <title>Budget Flow</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content={user ? tokens.colors.surface : tokens.colors.bg} />
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
        <DialogHost />
      </View>
    </View>
  );
}

function AppContent() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BudgetDataProvider>
          <RootLayoutContent />
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
