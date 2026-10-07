import { useMemo } from 'react';
import { StyleSheet, Platform } from 'react-native';
import { useTheme } from './useTheme';
import { useBreakpoint, LAYOUT, bottomClearance, STATUS_BAND, BOUNCE_MIN_HEIGHT, formsArePopups } from './useBreakpoint';
import { type, space, radius, elevation } from '../styles/tokens';

/**
 * Screen-level styles shared across screens, aligned to design/DESIGN.md tokens.
 * Components should build from `tokens` (useTheme) and components/ui instead.
 */
export const useThemedStyles = () => {
  const { tokens } = useTheme();
  const bp = useBreakpoint();

  const themedStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: tokens.colors.bg,
      width: '100%',
      height: '100%',
      position: 'relative',
      // Web compact: signed-in screens hold the status-bar band themselves
      // (the shell only draws it for the auth screens), so a screen's header
      // can paint its fill up behind the status bar; the tab view clips
      // anything drawn above a screen.
      ...(Platform.OS === 'web' && bp.isCompact ? { paddingTop: STATUS_BAND } : null),
    },
    /** A FormScreen route's root: transparent when the form is a pop-up, so the screen beneath shows. */
    formContainer: {
      flex: 1,
      width: '100%',
      height: '100%',
      position: 'relative',
      backgroundColor: formsArePopups(bp.isCompact) ? 'transparent' : tokens.colors.bg,
      ...(Platform.OS === 'web' && bp.isCompact ? { paddingTop: STATUS_BAND } : null),
    },
    scrollContent: {
      // Clearance for the fixed bottom tab bar derives from real chrome sizes.
      paddingBottom: bottomClearance(LAYOUT.tabBarHeight + space.s10),
      minHeight: BOUNCE_MIN_HEIGHT ?? '100%',
      paddingHorizontal: bp.isCompact ? 0 : bp.gutter,
    },
    textSecondary: {
      ...type.caption,
      color: tokens.colors.textMuted,
    },
    card: {
      backgroundColor: tokens.colors.surface,
      borderRadius: radius.lg,
      padding: bp.isExpanded ? space.s6 : bp.isMedium ? space.s5 : space.s4,
      marginBottom: space.s4,
      // Fill, not stroke (matches ui/Card). The transparent 1px border keeps
      // legacy layouts stable and lets screens that set a borderColor for
      // selection state keep working.
      borderWidth: 1,
      borderColor: 'transparent',
      width: '100%',
      ...(tokens.isDark ? null : elevation.e1),
    },
  }), [tokens, bp.gutter, bp.isCompact, bp.isMedium, bp.isExpanded]);

  return {
    themedStyles,
    breakpoint: bp,
  };
};
