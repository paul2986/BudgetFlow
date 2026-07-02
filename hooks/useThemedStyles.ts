import { useMemo } from 'react';
import { StyleSheet, Platform } from 'react-native';
import { useTheme } from './useTheme';
import { useBreakpoint, LAYOUT } from './useBreakpoint';
import { type, space, radius, elevation, font } from '../styles/tokens';

/**
 * Shared themed styles, aligned to design/DESIGN.md tokens.
 * New/redesigned components should prefer `tokens` from useTheme() directly;
 * this hook keeps the legacy style names working during migration.
 */
export const useThemedStyles = () => {
  const { currentColors, tokens } = useTheme();
  const bp = useBreakpoint();

  // Legacy flag consumed across screens: "not a phone-width layout".
  const isPad = !bp.isCompact;

  const themedStyles = useMemo(() => StyleSheet.create({
    wrapper: {
      backgroundColor: tokens.colors.bg,
      width: '100%',
      height: '100%',
    },
    container: {
      flex: 1,
      backgroundColor: tokens.colors.bg,
      width: '100%',
      height: '100%',
      position: 'relative',
    },
    content: {
      flex: 1,
      padding: bp.gutter,
      paddingBottom: 0,
      width: '100%',
    },
    scrollContent: {
      // Clearance for the fixed bottom tab bar derives from real chrome sizes.
      paddingBottom: LAYOUT.tabBarHeight + space.s10,
      minHeight: '100%',
      paddingHorizontal: bp.isCompact ? 0 : bp.gutter,
    },
    title: {
      ...type.h1,
      color: tokens.colors.text,
      marginBottom: space.s5,
    },
    subtitle: {
      ...type.h2,
      color: tokens.colors.text,
      marginBottom: space.s4,
    },
    text: {
      ...type.body,
      color: tokens.colors.text,
    },
    textSecondary: {
      ...type.caption,
      color: tokens.colors.textMuted,
    },
    section: {
      marginBottom: space.s4,
    },
    card: {
      backgroundColor: tokens.colors.surface,
      borderRadius: radius.lg,
      padding: bp.isExpanded ? space.s6 : bp.isMedium ? space.s5 : space.s4,
      marginBottom: space.s4,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      width: '100%',
      ...elevation.e1,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rowStart: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    column: {
      flexDirection: 'column',
    },
    flex1: {
      flex: 1,
    },
    centerContent: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    input: {
      minHeight: 48,
      borderWidth: 1,
      borderColor: tokens.colors.borderStrong,
      borderRadius: radius.sm,
      paddingHorizontal: space.s4,
      paddingVertical: space.s3,
      fontSize: type.body.fontSize,
      backgroundColor: tokens.colors.surfaceSunken,
      color: tokens.colors.text,
      marginBottom: space.s2,
      ...font(400),
    },
    picker: {
      borderWidth: 1,
      borderColor: tokens.colors.borderStrong,
      borderRadius: radius.sm,
      backgroundColor: tokens.colors.surfaceSunken,
      marginBottom: space.s4,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: bp.gutter,
      paddingVertical: space.s3,
      backgroundColor: 'transparent',
      borderBottomWidth: 0,
      // @ts-ignore web-only sticky positioning
      ...(Platform.OS === 'web' ? {
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: tokens.colors.bg,
      } : {}),
    },
    headerTitle: {
      ...type.h2,
      color: tokens.colors.text,
    },
    badge: {
      paddingHorizontal: space.s3,
      paddingVertical: space.s2,
      borderRadius: radius.full,
      alignSelf: 'flex-start',
    },
    badgeText: {
      ...type.caption,
      color: tokens.colors.surface,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: space.s8,
    },
    emptyStateText: {
      ...type.body,
      color: tokens.colors.textMuted,
      textAlign: 'center',
      marginTop: space.s4,
    },
    // Legacy tab-bar styles retained until every consumer migrates to components/nav/*.
    nativeTabContainer: {
      position: Platform.OS === 'web' ? 'fixed' as any : 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
      backgroundColor: 'transparent',
    },
    iosTabBar: {
      flexDirection: 'row',
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingTop: space.s2,
      paddingHorizontal: space.s3,
      minHeight: LAYOUT.tabBarHeight,
    },
    androidTabBar: {
      flexDirection: 'row',
      borderTopWidth: 1,
      paddingTop: space.s1,
      paddingHorizontal: space.s2,
      minHeight: LAYOUT.tabBarHeight,
    },
    nativeTabItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: space.s2,
      borderRadius: radius.md,
      marginHorizontal: space.s1,
    },
    floatingTabContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      alignItems: 'center',
      paddingHorizontal: space.s5,
      zIndex: 1000,
      pointerEvents: 'box-none',
    },
    floatingTabBar: {
      flexDirection: 'row',
      borderRadius: radius.xl,
      paddingHorizontal: space.s2,
      paddingVertical: space.s2,
      borderWidth: 1,
      minHeight: 64,
      marginBottom: space.s5,
      pointerEvents: 'auto',
      ...elevation.e2,
    },
    floatingTabItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: space.s3,
      paddingHorizontal: space.s4,
      borderRadius: radius.md,
      marginHorizontal: 2,
      minHeight: 48,
    },
  }), [tokens, bp.gutter, bp.isCompact, bp.isMedium, bp.isExpanded]);

  const themedButtonStyles = useMemo(() => StyleSheet.create({
    primary: {
      backgroundColor: tokens.colors.brand,
      borderColor: tokens.colors.brand,
      alignSelf: 'center',
      width: '100%',
    },
    secondary: {
      backgroundColor: tokens.colors.surfaceSunken,
      borderColor: tokens.colors.surfaceSunken,
      alignSelf: 'center',
      width: '100%',
    },
    danger: {
      backgroundColor: tokens.colors.danger,
      borderColor: tokens.colors.danger,
      alignSelf: 'center',
      width: '100%',
    },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: tokens.colors.borderStrong,
      alignSelf: 'center',
      width: '100%',
    },
    outlineSecondary: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: tokens.colors.borderStrong,
      alignSelf: 'center',
      width: '100%',
    },
    outlineDanger: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: tokens.colors.danger,
      alignSelf: 'center',
      width: '100%',
    },
    small: {
      paddingVertical: space.s2,
      paddingHorizontal: space.s4,
      width: 'auto',
    },
    disabled: {
      opacity: 0.4,
    },
  }), [tokens]);

  return {
    themedStyles,
    themedButtonStyles,
    isPad,
    breakpoint: bp,
    /** Deprecated alias — use `useTheme().currentColors` or tokens. */
    currentColors,
  };
};
