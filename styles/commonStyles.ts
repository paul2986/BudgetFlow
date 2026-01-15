
import { StyleSheet, ViewStyle, TextStyle, Platform } from 'react-native';

export const colors = {
  primary: '#2E7D32',      // Green for primary actions
  secondary: '#1976D2',    // Blue for secondary actions
  accent: '#FF5722',       // Orange/Red for expenses
  income: '#4CAF50',       // Green for income
  expense: '#F44336',      // Red for expenses
  household: '#9C27B0',    // Purple for household
  personal: '#FF9800',     // Orange for personal
  background: '#F8F9FA',   // Slightly warmer light grey background
  backgroundAlt: '#FFFFFF', // White for cards
  text: '#212121',         // Dark grey text
  textSecondary: '#757575', // Medium grey text
  border: '#E0E0E0',       // Light border
  success: '#4CAF50',      // Success green
  warning: '#FF9800',      // Warning orange
  error: '#F44336',        // Error red
  info: '#2196F3',         // Info blue
};

export const darkColors = {
  primary: '#4CAF50',      // Brighter green for dark mode
  secondary: '#2196F3',    // Brighter blue for dark mode
  accent: '#FF7043',       // Softer orange for dark mode
  income: '#66BB6A',       // Lighter green for income
  expense: '#EF5350',      // Lighter red for expenses
  household: '#AB47BC',    // Lighter purple for household
  personal: '#FFA726',     // Lighter orange for personal
  background: '#0F1419',   // Modern dark blue background
  backgroundAlt: '#1A2332', // Slightly lighter dark blue for cards
  text: '#E8F4FD',         // Light blue-tinted white text
  textSecondary: '#8FA2B7', // Medium blue-grey text
  border: '#2A3441',       // Dark blue-grey border
  success: '#66BB6A',      // Success green
  warning: '#FFA726',      // Warning orange
  error: '#EF5350',        // Error red
  info: '#42A5F5',         // Info blue for dark mode
};

export const buttonStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors.primary,
    alignSelf: 'center',
    width: '100%',
  },
  secondary: {
    backgroundColor: colors.secondary,
    alignSelf: 'center',
    width: '100%',
  },
  danger: {
    backgroundColor: colors.error,
    alignSelf: 'center',
    width: '100%',
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.primary,
    alignSelf: 'center',
    width: '100%',
  },
  small: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    width: 'auto',
  },
});

export const commonStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.background,
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  scrollContent: {
    paddingBottom: 140, // Increased padding for the new nav bar position (moved down more)
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    color: colors.text,
    marginBottom: 20,
    letterSpacing: -1,
    fontFamily: Platform.select({ ios: 'Inter', android: 'sans-serif-black', web: 'Inter, system-ui, -apple-system, sans-serif' }),
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
    letterSpacing: -0.3,
    fontFamily: Platform.select({ ios: 'Inter', android: 'sans-serif-medium', web: 'Inter, system-ui, -apple-system, sans-serif' }),
  },
  text: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.text,
    lineHeight: 24,
    fontFamily: Platform.select({ ios: 'Inter', android: 'sans-serif-medium', web: 'Inter, system-ui, -apple-system, sans-serif' }),
  },
  textSecondary: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    lineHeight: 20,
    fontFamily: Platform.select({ ios: 'Inter', android: 'sans-serif', web: 'Inter, system-ui, -apple-system, sans-serif' }),
  },
  section: {
    marginBottom: 24,
  },
  card: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 16,
    padding: 24, // Consistent padding across all cards
    marginBottom: 16,
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.08)',
    elevation: 4,
    borderWidth: 1,
    borderColor: colors.border,
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
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: colors.backgroundAlt,
    color: colors.text,
    marginBottom: 16,
    fontWeight: '500',
  },
  picker: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.backgroundAlt,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: colors.backgroundAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
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
    color: colors.backgroundAlt,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyStateText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 24,
  },
});
