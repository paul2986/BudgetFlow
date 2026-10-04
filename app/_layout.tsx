import { useCallback, useEffect, useState } from 'react';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { View, Platform, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Tabs } from 'expo-router';
import Head from 'expo-router/head';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Analytics } from '@vercel/analytics/react';

import { useTheme, ThemeProvider } from '../hooks/useTheme';
import { useToast, ToastProvider } from '../hooks/useToast';
import { useBudgetData, BudgetDataProvider } from '../hooks/useBudgetData';
import { useAuth } from '../hooks/useAuth';
import { useBreakpoint, STATUS_BAND } from '../hooks/useBreakpoint';
import { useEditorTransitions } from '../hooks/useEditorTransitions';
import { setupErrorLogging } from '../utils/errorLogger';
import { rememberInviteFromUrl } from '../utils/sharing';

import AnimatedSplash from '../components/AnimatedSplash';
import AuthGuard from '../components/AuthGuard';
import ToastContainer from '../components/ToastContainer';
import DialogHost from '../components/DialogHost';
import BottomTabBar from '../components/nav/BottomTabBar';
import NavRail from '../components/nav/NavRail';
import Sidebar from '../components/nav/Sidebar';
// Side effect: its popstate listener must be registered before expo-router's.
import '../hooks/useDiscardGuard';

// An invite link opened while signed out is kept until sign-in (see utils/sharing).
rememberInviteFromUrl();

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
  const { width: windowWidth } = useWindowDimensions();
  const [contentWidth, setContentWidth] = useState(0);
  const editorTransitions = useEditorTransitions(contentWidth || windowWidth, bp.isCompact);

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
          height: var(--app-height, calc(100dvh + var(--toolbar-overhang, 0px)));
          background-color: ${tokens.colors.bg} !important;
        }
        #root {
          height: var(--app-height, calc(100dvh + var(--toolbar-overhang, 0px)));
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
        /* Browser autofill paints its own yellow/blue fill over just the
           <input>, inside our rounded field. background-color can't be
           overridden there, so cover it with an inset shadow in the field
           color and restore the text color. The long transition stops the
           UA fill from flashing in Chrome. */
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 100px ${tokens.colors.field} inset !important;
          box-shadow: 0 0 0 100px ${tokens.colors.field} inset !important;
          -webkit-text-fill-color: ${tokens.colors.text} !important;
          caret-color: ${tokens.colors.text};
          border-radius: 0;
          transition: background-color 600000s 0s, color 600000s 0s;
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
      {Platform.OS === 'web' && bp.isCompact && !user ? (
        // Status-bar band for the auth screens. Signed-in screens hold it
        // themselves (useThemedStyles `container`) so their header can paint
        // its fill up behind the status bar: status bar and header read as
        // one bar, and a large-title screen at rest stays page bg. In the
        // iOS home-screen app it also holds a small --status-gap
        // (index.html) so header text sits below the iOS 27 status-bar blur.
        <View style={{ height: STATUS_BAND }} />
      ) : null}
      {/* Web only: these are document tags, and on iOS expo-router's Head is a
          Handoff/Spotlight API that requires a configured origin. */}
      {Platform.OS === 'web' && (
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
      )}

      <StatusBar
        style={isDarkMode ? 'light' : 'dark'}
      />

      {showSidebar && <Sidebar />}
      {showRail && <NavRail />}

      <View
        style={{ flex: 1, backgroundColor: 'transparent' }}
        onLayout={(e) => setContentWidth(e.nativeEvent.layout.width)}
      >
        <AuthGuard user={user} loading={authLoading || isInitialLoad}>
          <Tabs
            // Back (browser, Android, router.back) returns to the previous
            // screen, e.g. an edit form back to its list. The default,
            // firstRoute, keeps only Home + current, so opening a form
            // replaced the list's browser history entry instead of pushing.
            backBehavior="history"
            screenOptions={(props) => ({
              headerShown: false,
              tabBarStyle: { display: 'none' },
              ...editorTransitions(props),
            })}
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
            <Tabs.Screen name="tools/index" />
            <Tabs.Screen name="tools/credit-card" options={{ href: null }} />
            <Tabs.Screen name="tools/savings" options={{ href: null }} />
            <Tabs.Screen name="tools/mortgage" options={{ href: null }} />
            <Tabs.Screen name="tools/debt-help" options={{ href: null }} />
            <Tabs.Screen name="budget-lock" options={{ href: null }} />
            <Tabs.Screen name="manage-categories" options={{ href: null }} />
            <Tabs.Screen name="currency" options={{ href: null }} />
            <Tabs.Screen name="admin" options={{ href: null }} />
            <Tabs.Screen name="share-budget" options={{ href: null }} />
            <Tabs.Screen name="import-budget" options={{ href: null }} />
            <Tabs.Screen name="invite/[token]" options={{ href: null }} />
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
          {/* Web only: it injects a <script> via `document`, which native lacks
              (its `typeof window` browser check passes on native too). */}
          {Platform.OS === 'web' && <Analytics />}
        </BudgetDataProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

// Keep the native splash visible until AnimatedSplash has taken over from it,
// so text never flashes in the system font while the Inter fonts load. Web
// already loads Inter via index.html and has no native splash.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  // On font error, proceed with the system font rather than blocking the app.
  const ready = fontsLoaded || !!fontError;
  const [splashDone, setSplashDone] = useState(false);
  const finishSplash = useCallback(() => setSplashDone(true), []);

  return (
    <>
      {ready ? (
        // Swipeable rows (e.g. swipe-to-delete on expenses) need the gesture root.
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <AppContent />
          </SafeAreaProvider>
        </GestureHandlerRootView>
      ) : null}
      {/* Covers the app until it is ready, then animates away. */}
      {splashDone ? null : <AnimatedSplash ready={ready} onDone={finishSplash} />}
    </>
  );
}
