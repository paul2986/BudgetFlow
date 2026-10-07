import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Image, ScrollView, Animated, Platform, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect, Line } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import { useBudgetData } from '../../hooks/useBudgetData';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useSidebarCollapsed } from '../../hooks/useSidebarCollapsed';
import { LAYOUT, bottomClearance, useBottomInset, useBreakpoint } from '../../hooks/useBreakpoint';
import { releaseDiscardGuard } from '../../hooks/useDiscardGuard';
import Icon from '../Icon';
import { Avatar, ConfirmDialog } from '../ui';
import { type, space, radius, elevation, motion } from '../../styles/tokens';
import { NAV_TABS, isTabActive } from './navConfig';
import GlassPanel from './GlassPanel';

/**
 * Sidebar for medium and expanded classes (DESIGN.md §2.6): a floating glass
 * panel, inset from the window edge, in the tab bar's material.
 * - Open (264): icon + label rows, budget switcher, Add expense, account.
 * - Closed (72): the same rows clipped to their icon column; on web each
 *   shows its label as a tooltip on hover.
 * - Expanded: docked. Content reflows as it opens and closes, and the choice
 *   is remembered on the device. Starts open.
 * - Medium: closed; opening it floats over the content above a scrim, and a
 *   tap outside, Escape or navigating closes it.
 * Toggle: the sidebar button at the top, or ⌘\ / Ctrl+\ on web.
 */

const OPEN = LAYOUT.sidebarWidth;
const CLOSED = LAYOUT.sidebarCollapsedWidth;
/** Gap between the panel and the window edge. */
const INSET = space.s3;
/** Panel padding; what's left of the closed width is the icon column. */
const PAD = space.s3;
const ICON_COLUMN = CLOSED - 2 * PAD;
const TIP_HEIGHT = 26;
const SHORTCUT = Platform.OS === 'web' && typeof navigator !== 'undefined' && /Mac|iP/.test(navigator.platform) ? '⌘\\' : 'Ctrl+\\';

type ShowTip = (label: string | null, centerY?: number) => void;

/** SF Symbols' sidebar.left, which Ionicons lacks. */
function SidebarGlyph({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Rect x={2} y={3.5} width={16} height={13} rx={3} stroke={color} strokeWidth={1.6} />
      <Line x1={7.5} y1={3.5} x2={7.5} y2={16.5} stroke={color} strokeWidth={1.6} />
    </Svg>
  );
}

/** Reports a pressable's vertical centre for the hover tooltip (web only). */
function useTipTarget(label: string, showTip: ShowTip) {
  const ref = useRef<View>(null);
  return {
    ref,
    onHoverIn: () => ref.current?.measureInWindow((_x, y, _w, h) => showTip(label, y + h / 2)),
    onHoverOut: () => showTip(null),
  };
}

interface RowProps {
  icon: string;
  label: string;
  onPress: () => void;
  labelOpacity: Animated.AnimatedInterpolation<number>;
  showTip: ShowTip;
  active?: boolean;
  variant?: 'nav' | 'primary' | 'destructive' | 'outlined';
  accessibilityLabel?: string;
  trailing?: React.ReactNode;
}

function SidebarRow({
  icon,
  label,
  onPress,
  labelOpacity,
  showTip,
  active,
  variant = 'nav',
  accessibilityLabel,
  trailing,
}: RowProps) {
  const { tokens } = useTheme();
  const tip = useTipTarget(label, showTip);
  const c = tokens.colors;
  const iconColor =
    variant === 'primary' ? c.onBrand : variant === 'destructive' ? c.danger : active ? c.onBrandSubtle : c.textMuted;
  const textColor =
    variant === 'primary' ? c.onBrand : variant === 'destructive' ? c.danger : active ? c.onBrandSubtle : c.text;

  return (
    <Pressable
      ref={tip.ref}
      onPress={onPress}
      onHoverIn={tip.onHoverIn}
      onHoverOut={tip.onHoverOut}
      accessibilityRole={variant === 'nav' ? 'tab' : 'button'}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={variant === 'nav' ? { selected: !!active } : undefined}
      style={({ pressed, hovered }: any) => ({
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 44,
        borderRadius: radius.md,
        backgroundColor:
          variant === 'primary'
            ? c.brand
            : active
              ? c.brandSubtle
              : hovered || pressed
                ? variant === 'destructive'
                  ? c.dangerSubtle
                  : c.surfaceHover
                : 'transparent',
        opacity: variant === 'primary' && pressed ? 0.85 : 1,
        borderWidth: variant === 'outlined' ? 1 : 0,
        borderColor: c.border,
        // @ts-ignore web transition
        transitionDuration: `${motion.fast}ms`,
      })}
    >
      <View style={{ width: ICON_COLUMN, alignItems: 'center' }}>
        <Icon name={icon as any} size={20} color={iconColor} />
      </View>
      <Animated.View
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', opacity: labelOpacity }}
      >
        <Text
          numberOfLines={1}
          style={[active || variant !== 'nav' ? type.bodyMed : type.body, { color: textColor, flex: 1 }]}
        >
          {label}
        </Text>
        {trailing ? <View style={{ marginHorizontal: space.s3 }}>{trailing}</View> : null}
      </Animated.View>
    </Pressable>
  );
}

export default function Sidebar() {
  const { tokens, isDarkMode } = useTheme();
  const { user, signOut } = useAuth();
  const { activeBudget } = useBudgetData();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset();
  const reduceMotion = useReducedMotion();
  const { isExpanded: docked } = useBreakpoint();
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [tip, setTip] = useState<{ label: string; y: number } | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const open = docked ? !collapsed : overlayOpen;
  const width = useRef(new Animated.Value(open ? OPEN : CLOSED)).current;

  useEffect(() => {
    const toValue = open ? OPEN : CLOSED;
    if (reduceMotion) {
      width.setValue(toValue);
      return;
    }
    const anim = Animated.spring(width, { toValue, ...motion.spring, overshootClamping: true, useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [open, reduceMotion, width]);

  // The floating sidebar closes once you've gone somewhere, or when the
  // window grows wide enough to dock it.
  useEffect(() => {
    setOverlayOpen(false);
  }, [pathname, docked]);

  const toggle = () => (docked ? setCollapsed(!collapsed) : setOverlayOpen((o) => !o));
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        toggleRef.current();
      } else if (e.key === 'Escape') {
        setOverlayOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const labelOpacity = width.interpolate({ inputRange: [CLOSED + 48, OPEN], outputRange: [0, 1], extrapolate: 'clamp' });
  const scrimOpacity = width.interpolate({ inputRange: [CLOSED, OPEN], outputRange: [0, 1], extrapolate: 'clamp' });

  const showTip: ShowTip = (label, y) => {
    if (Platform.OS !== 'web' || label === null || y === undefined) setTip(null);
    else setTip({ label, y });
  };
  const toggleTip = useTipTarget(`${open ? 'Hide' : 'Show'} sidebar  ${SHORTCUT}`, showTip);

  const go = (route: string) => releaseDiscardGuard(() => router.navigate(route as any));
  const push = (route: string) => releaseDiscardGuard(() => router.push(route as any));

  return (
    <>
      {/* Holds the panel's place in the row, so docked content reflows with it. */}
      <Animated.View style={{ width: docked ? Animated.add(width, INSET) : INSET + CLOSED, flexShrink: 0 }} />

      {!docked ? (
        <Animated.View
          pointerEvents={overlayOpen ? 'auto' : 'none'}
          style={[StyleSheet.absoluteFill, { zIndex: 30, opacity: scrimOpacity, backgroundColor: tokens.colors.overlay }]}
        >
          {overlayOpen ? (
            <Pressable
              onPress={() => setOverlayOpen(false)}
              accessibilityLabel="Close sidebar"
              style={StyleSheet.absoluteFill}
            />
          ) : null}
        </Animated.View>
      ) : null}

      <Animated.View
        style={{
          position: 'absolute',
          zIndex: 31,
          left: insets.left + INSET,
          top: insets.top + INSET,
          bottom: bottomClearance(bottomInset + INSET),
          width,
        }}
      >
        <GlassPanel borderRadius={radius.xl} fill style={{ flex: 1 }}>
          <View style={{ flex: 1, overflow: 'hidden', borderRadius: radius.xl, padding: PAD }}>
            {/* Sidebar toggle + brand */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.s3 }}>
              <View style={{ width: ICON_COLUMN, alignItems: 'center' }}>
                <Pressable
                  ref={toggleTip.ref}
                  onPress={toggle}
                  onHoverIn={toggleTip.onHoverIn}
                  onHoverOut={toggleTip.onHoverOut}
                  accessibilityRole="button"
                  accessibilityLabel={open ? 'Hide sidebar' : 'Show sidebar'}
                  accessibilityState={{ expanded: open }}
                  style={({ pressed, hovered }: any) => ({
                    width: 44,
                    height: 44,
                    borderRadius: radius.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed || hovered ? tokens.colors.surfaceHover : 'transparent',
                  })}
                >
                  <SidebarGlyph color={tokens.colors.textMuted} />
                </Pressable>
              </View>
              <Animated.View
                style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', opacity: labelOpacity }}
              >
                <Image
                  source={require('../../assets/images/icon.png')}
                  style={{ width: 28, height: 28, borderRadius: radius.sm, marginRight: space.s2 }}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                />
                <Text style={[type.h3, { color: tokens.colors.text, flex: 1 }]} numberOfLines={1}>
                  Budget Flow
                </Text>
              </Animated.View>
            </View>

            <SidebarRow
              icon="wallet-outline"
              label={activeBudget?.name || 'Select budget'}
              accessibilityLabel={`Switch budget. Current budget: ${activeBudget?.name || 'none'}`}
              variant="outlined"
              onPress={() => push('/budgets')}
              labelOpacity={labelOpacity}
              showTip={showTip}
              trailing={<Icon name="chevron-expand-outline" size={16} color={tokens.colors.textFaint} />}
            />

            {/* Destinations */}
            <ScrollView
              style={{ flex: 1, marginTop: space.s4 }}
              contentContainerStyle={{ gap: space.s1 }}
              showsVerticalScrollIndicator={false}
            >
              {NAV_TABS.map((tab) => {
                const active = isTabActive(pathname, tab.route);
                return (
                  <SidebarRow
                    key={tab.route}
                    icon={active ? tab.activeIcon : tab.icon}
                    label={tab.label}
                    active={active}
                    onPress={() => go(tab.route)}
                    labelOpacity={labelOpacity}
                    showTip={showTip}
                  />
                );
              })}

              <View style={{ marginTop: space.s4 }}>
                <SidebarRow
                  icon="add"
                  label="Add expense"
                  variant="primary"
                  onPress={() => push('/add-expense')}
                  labelOpacity={labelOpacity}
                  showTip={showTip}
                />
              </View>
            </ScrollView>

            {/* Account */}
            <View
              style={{
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: tokens.colors.borderStrong,
                paddingTop: space.s3,
                gap: space.s1,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
                <View style={{ width: ICON_COLUMN, alignItems: 'center' }}>
                  <Avatar name={user?.email || '?'} seed={user?.id} size={28} />
                </View>
                <Animated.View style={{ flex: 1, minWidth: 0, opacity: labelOpacity }}>
                  <Text style={[type.caption, { color: tokens.colors.textMuted }]} numberOfLines={1}>
                    {user?.email || 'Signed in'}
                  </Text>
                </Animated.View>
              </View>
              <SidebarRow
                icon="log-out-outline"
                label="Sign out"
                variant="destructive"
                onPress={() => setConfirmSignOut(true)}
                labelOpacity={labelOpacity}
                showTip={showTip}
              />
            </View>
          </View>
        </GlassPanel>
      </Animated.View>

      {/* Tooltips only belong to the closed sidebar (a hover measured just
          before it opened can land after). */}
      {tip && !open ? (
        <View
          pointerEvents="none"
          style={[
            {
              position: 'fixed' as any,
              zIndex: 32,
              left: insets.left + INSET + CLOSED + space.s2,
              top: tip.y - TIP_HEIGHT / 2,
              height: TIP_HEIGHT,
              justifyContent: 'center',
              paddingHorizontal: space.s2,
              borderRadius: radius.sm,
              backgroundColor: tokens.colors.surfaceRaised,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: tokens.colors.borderStrong,
            },
            isDarkMode ? null : elevation.e2,
          ]}
        >
          <Text style={[type.caption, { color: tokens.colors.text }]} numberOfLines={1}>
            {tip.label}
          </Text>
        </View>
      ) : null}

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
    </>
  );
}
