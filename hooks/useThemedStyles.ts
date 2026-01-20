
import { useMemo } from 'react';
import { StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { useTheme } from './useTheme';

export const useThemedStyles = () => {
  const { currentColors } = useTheme();
  const { width, height } = useWindowDimensions();

  const isPad = useMemo(() => {
    if (Platform.OS === 'web') {
      return width >= 768;
    }

    const aspectRatio = height / width;
    // iPad detection: larger screen + typical iPad aspect ratios
    return Platform.OS === 'ios' && Math.min(width, height) >= 768 && (
      (aspectRatio > 1.2 && aspectRatio < 1.4) || // Portrait iPad
      (aspectRatio > 0.7 && aspectRatio < 0.85)   // Landscape iPad
    );
  }, [width, height]);

  const themedStyles = useMemo(() => StyleSheet.create({
    wrapper: {
      backgroundColor: currentColors.background,
      width: '100%',
      height: '100%',
    },
    container: {
      flex: 1,
      backgroundColor: currentColors.background,
      width: '100%',
      height: '100%',
      position: 'relative', // Ensure proper positioning context
    },
    content: {
      flex: 1,
      padding: isPad ? 32 : 16,
      paddingBottom: 0,
      width: '100%',
    },
    scrollContent: {
      paddingBottom: 140, // Increased padding to ensure content is visible above nav bar
      minHeight: '100%', // Ensure content takes full height to prevent clipping
      paddingHorizontal: isPad ? 32 : 0,
    },
    title: {
      fontSize: isPad ? 36 : 28,
      fontWeight: '800',
      textAlign: 'center',
      color: currentColors.text,
      marginBottom: isPad ? 28 : 20,
      letterSpacing: -1,
      fontFamily: Platform.select({ ios: 'Inter', android: 'sans-serif-bold', web: 'Inter, system-ui, -apple-system, sans-serif' }),
    },
    subtitle: {
      fontSize: isPad ? 24 : 20,
      fontWeight: '600',
      color: currentColors.text,
      marginBottom: isPad ? 20 : 16,
      letterSpacing: -0.3,
      fontFamily: Platform.select({ ios: 'Inter', android: 'sans-serif-medium', web: 'Inter, system-ui, -apple-system, sans-serif' }),
    },
    text: {
      fontSize: isPad ? 18 : 16,
      fontWeight: '400',
      color: currentColors.text,
      lineHeight: isPad ? 28 : 24,
    },
    textSecondary: {
      fontSize: isPad ? 16 : 14,
      fontWeight: '400',
      color: currentColors.textSecondary,
      lineHeight: isPad ? 24 : 20,
    },
    section: {
      marginBottom: 16,
    },
    card: {
      backgroundColor: currentColors.backgroundAlt,
      borderRadius: isPad ? 20 : 16,
      padding: isPad ? 24 : 15,
      marginBottom: isPad ? 20 : 16,
      boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.08)',
      elevation: 4,
      borderWidth: 1,
      borderColor: currentColors.border,
      width: '100%', // Standardized full width for all cards
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
      borderWidth: 2,
      borderColor: currentColors.border,
      borderRadius: 12,
      padding: 16,
      fontSize: 16,
      backgroundColor: currentColors.backgroundAlt,
      color: currentColors.text,
      marginBottom: 8,
      fontWeight: '500',
    },
    picker: {
      borderWidth: 2,
      borderColor: currentColors.border,
      borderRadius: 12,
      backgroundColor: currentColors.backgroundAlt,
      marginBottom: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: isPad ? 32 : 20,
      paddingVertical: isPad ? 20 : 16,
      backgroundColor: 'transparent',
      borderBottomWidth: 0,
      borderBottomColor: 'transparent',
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
    },
    headerTitle: {
      fontSize: isPad ? 24 : 20,
      fontWeight: '700',
      color: currentColors.text,
      letterSpacing: -0.3,
    },
    badge: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      alignSelf: 'flex-start',
    },
    badgeText: {
      fontSize: 13,
      fontWeight: '600',
      color: currentColors.backgroundAlt,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
    },
    emptyStateText: {
      fontSize: 16,
      color: currentColors.textSecondary,
      textAlign: 'center',
      marginTop: 16,
      lineHeight: 24,
    },
    // Native Style Tab Bars
    nativeTabContainer: {
      position: Platform.OS === 'web' ? 'fixed' as any : 'absolute',
      bottom: Platform.OS === 'web' ? 0 : -100, // Extend below viewport only on native to ensure coverage
      left: 0,
      right: 0,
      zIndex: 1000,
      backgroundColor: 'transparent',
      paddingBottom: Platform.OS === 'web' ? 0 : 100, // Add padding on native to bring content back up
    },
    iosTabBar: {
      flexDirection: 'row',
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingTop: 8,
      paddingHorizontal: 12,
      minHeight: 60,
      // @ts-ignore
      backdropFilter: Platform.OS === 'web' ? 'blur(20px)' : undefined,
    },
    androidTabBar: {
      flexDirection: 'row',
      borderTopWidth: 1,
      elevation: 12,
      paddingTop: 6,
      paddingHorizontal: 8,
      minHeight: 68,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
    },
    nativeTabItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 16,
      marginHorizontal: 4,
    },
    // iOS 26 Style Floating Tab Bar (kept as fallback or for specific views)
    floatingTabContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      alignItems: 'center',
      paddingHorizontal: 20,
      zIndex: 1000, // Ensure tab bar stays on top
      pointerEvents: 'box-none', // Allow touches to pass through container but not the tab bar itself
    },
    floatingTabBar: {
      flexDirection: 'row',
      borderRadius: 28,
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderWidth: 1,
      boxShadow: '0px 8px 32px rgba(0, 0, 0, 0.12)',
      elevation: 12,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      backdropFilter: 'blur(20px)',
      minHeight: 64,
      marginBottom: 20, // Set margin to match left/right padding (20px)
      pointerEvents: 'auto', // Ensure tab bar receives touches
    },
    floatingTabItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 20,
      marginHorizontal: 2,
      minHeight: 48,
    },
  }), [currentColors, isPad]);

  const themedButtonStyles = useMemo(() => StyleSheet.create({
    primary: {
      backgroundColor: currentColors.primary,
      borderColor: currentColors.primary,
      alignSelf: 'center',
      width: '100%',
    },
    secondary: {
      backgroundColor: currentColors.secondary,
      borderColor: currentColors.secondary,
      alignSelf: 'center',
      width: '100%',
    },
    danger: {
      backgroundColor: currentColors.error,
      borderColor: currentColors.error,
      alignSelf: 'center',
      width: '100%',
    },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderColor: currentColors.primary,
      alignSelf: 'center',
      width: '100%',
    },
    outlineSecondary: {
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderColor: currentColors.secondary,
      alignSelf: 'center',
      width: '100%',
    },
    outlineDanger: {
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderColor: currentColors.error,
      alignSelf: 'center',
      width: '100%',
    },
    small: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      width: 'auto',
    },
    disabled: {
      backgroundColor: currentColors.textSecondary + '40',
      borderColor: currentColors.textSecondary + '40',
      opacity: 0.6,
    },
  }), [currentColors]);

  return {
    themedStyles,
    themedButtonStyles,
    isPad, // Export isPad flag for components to use
  };
};
