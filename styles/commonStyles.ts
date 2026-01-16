
import { StyleSheet, ViewStyle, TextStyle, Platform } from 'react-native';

export const colors = {
  primary: '#7C3AED',      // Vibrant Purple
  secondary: '#2563EB',    // Cyber Blue
  accent: '#0891B2',       // Vibrant Cyan/Teal
  income: '#10B981',       // Success Green
  expense: '#EF4444',      // Error Red
  text: '#1F2937',         // Dark Gray Text
  textSecondary: '#6B7280', // Medium Gray Text
  border: '#E5E7EB',       // Light Gray Border
  background: '#F9FAFB',   // Very Light Gray BG
  backgroundAlt: '#FFFFFF', // White BG
  info: '#3B82F6',         // Info Blue
  warning: '#F59E0B',      // Warning Amber
  error: '#EF4444',        // Error Red
  success: '#10B981',      // Success Green
  household: '#7C3AED',    // Mapped to Primary Purple
  personal: '#2563EB',     // Mapped to Secondary Blue
  cardShadow: 'rgba(0, 0, 0, 0.05)',
  brandGradient: ['#7C3AED', '#2563EB', '#0891B2'], // Vibrant Purple -> Blue -> Cyan
};

export const darkColors = {
  primary: '#8B5CF6',      // Saturated Purple
  secondary: '#3B82F6',    // Saturated Blue
  accent: '#06B6D4',       // Saturated Cyan
  income: '#10B981',       // Vibrant Success Green
  expense: '#F43F5E',      // Vibrant Error Red
  text: '#F9FAFB',         // Clean White Text
  textSecondary: '#94A3B8', // Slate-600 secondary text
  border: '#1E293B',       // Slate border
  background: '#020617',   // Deeper Black/Navy (Slate-950)
  backgroundAlt: '#0F172A', // Slate-900 BG
  info: '#3B82F6',         // Info Blue
  warning: '#F59E0B',      // Warning Amber
  error: '#F43F5E',        // Error Red
  success: '#10B981',      // Success Green
  household: '#8B5CF6',    // Mapped to Primary Purple
  personal: '#3B82F6',     // Mapped to Secondary Blue
  cardShadow: 'rgba(0, 0, 0, 0.5)',
  brandGradient: ['#7C3AED', '#2563EB', '#0891B2'], // Maintain consistent premium gradient
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
