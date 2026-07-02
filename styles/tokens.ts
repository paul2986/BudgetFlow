import { Platform, TextStyle, ViewStyle } from 'react-native';

/**
 * BudgetFlow design tokens — single source of truth.
 * Spec: design/DESIGN.md §2.1–2.4 ("Calm Ledger").
 *
 * Rules enforced by this file:
 * - No alpha-suffix color math (`color + '15'`) anywhere in the app; every fill
 *   is a named *Subtle token below.
 * - No font sizes outside the `type` scale. Floor is 12px.
 * - Semantic colors (income/expense/household/personal/warning) must always be
 *   paired with an icon or label in the UI — color is never the sole carrier.
 */

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

export interface ColorTokens {
  brand: string;
  onBrand: string;
  brandSubtle: string;
  onBrandSubtle: string;
  bg: string;
  surface: string;
  /** One visible lightness step above `surface`; used instead of bigger shadows in dark mode. */
  surfaceRaised: string;
  surfaceSunken: string;
  text: string;
  textMuted: string;
  /** Tertiary text — only legal at >=14px sizes. */
  textFaint: string;
  border: string;
  borderStrong: string;
  income: string;
  incomeSubtle: string;
  expense: string;
  expenseSubtle: string;
  warning: string;
  warningSubtle: string;
  danger: string;
  dangerSubtle: string;
  household: string;
  personal: string;
  overlay: string;
}

export const lightColors: ColorTokens = {
  brand: '#4F46E5',
  onBrand: '#FFFFFF',
  brandSubtle: '#EEF2FF',
  onBrandSubtle: '#3730A3',
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#F1F5F9',
  text: '#0F172A',
  textMuted: '#475569',
  textFaint: '#64748B',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  income: '#047857',
  incomeSubtle: '#ECFDF5',
  expense: '#BE123C',
  expenseSubtle: '#FFF1F2',
  warning: '#B45309',
  warningSubtle: '#FFFBEB',
  danger: '#DC2626',
  dangerSubtle: '#FEF2F2',
  household: '#4338CA',
  personal: '#0E7490',
  overlay: 'rgba(15,23,42,0.5)',
};

export const darkColors: ColorTokens = {
  brand: '#818CF8',
  onBrand: '#1E1B4B',
  brandSubtle: '#312E8166',
  onBrandSubtle: '#C7D2FE',
  bg: '#0B1220',
  surface: '#151E2E',
  surfaceRaised: '#1B2537',
  surfaceSunken: '#0F1726',
  text: '#F1F5F9',
  textMuted: '#94A3B8',
  textFaint: '#7C8BA1',
  border: '#293548',
  borderStrong: '#3B4A63',
  income: '#34D399',
  incomeSubtle: '#064E3B4D',
  expense: '#FB7185',
  expenseSubtle: '#88133756',
  warning: '#FBBF24',
  warningSubtle: '#78350F4D',
  danger: '#F87171',
  dangerSubtle: '#7F1D1D4D',
  household: '#A5B4FC',
  personal: '#67E8F9',
  overlay: 'rgba(2,6,23,0.65)',
};

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

type FontWeightToken = 400 | 500 | 600 | 700;

const NATIVE_FONT_FAMILY: Record<FontWeightToken, string> = {
  400: 'Inter_400Regular',
  500: 'Inter_500Medium',
  600: 'Inter_600SemiBold',
  700: 'Inter_700Bold',
};

/**
 * Narrow font style type: keeps StyleSheet.create inference narrow so styles
 * that mix these tokens stay assignable where legacy code applies them.
 */
export interface FontToken {
  fontFamily: string;
  fontWeight?: TextStyle['fontWeight'];
}

/**
 * Weight-correct font styling per platform. Native loads one family per weight
 * via @expo-google-fonts/inter; web uses the variable-weight Inter stack from
 * public/index.html with numeric fontWeight.
 */
export const font = (weight: FontWeightToken): FontToken =>
  Platform.OS === 'web'
    ? {
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontWeight: String(weight) as TextStyle['fontWeight'],
      }
    : { fontFamily: NATIVE_FONT_FAMILY[weight] };

/** Apply to every currency amount so digits align and never jitter. */
export const tabularNums: { fontVariant: TextStyle['fontVariant'] } = {
  fontVariant: ['tabular-nums'],
};

export interface TypeToken extends FontToken {
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: TextStyle['textTransform'];
}

/** The only permitted text styles. No other font sizes are allowed. */
export const type: Record<
  'display' | 'h1' | 'h2' | 'h3' | 'body' | 'bodyMed' | 'caption' | 'overline',
  TypeToken
> = {
  display: { fontSize: 34, lineHeight: 40, letterSpacing: -0.5, ...font(700) },
  h1: { fontSize: 28, lineHeight: 34, letterSpacing: -0.5, ...font(700) },
  h2: { fontSize: 22, lineHeight: 28, ...font(600) },
  h3: { fontSize: 17, lineHeight: 24, ...font(600) },
  body: { fontSize: 16, lineHeight: 24, ...font(400) },
  bodyMed: { fontSize: 16, lineHeight: 24, ...font(500) },
  caption: { fontSize: 13, lineHeight: 18, ...font(500) },
  overline: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    ...font(600),
  },
};

// ---------------------------------------------------------------------------
// Space & radius (4pt scale)
// ---------------------------------------------------------------------------

export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s7: 32,
  s8: 40,
  s9: 48,
  s10: 64,
} as const;

export const radius = {
  sm: 8, // chips, inputs
  md: 12, // buttons, list rows
  lg: 16, // cards
  xl: 24, // sheets, hero
  full: 999, // avatars, pills
} as const;

// ---------------------------------------------------------------------------
// Elevation
// ---------------------------------------------------------------------------

const shadow = (
  offsetY: number,
  shadowRadius: number,
  opacity: number,
  androidElevation: number
): ViewStyle =>
  Platform.select<ViewStyle>({
    web: {
      // react-native-web supports boxShadow directly
      boxShadow: `0 ${offsetY}px ${shadowRadius}px rgba(15,23,42,${opacity})`,
    } as ViewStyle,
    default: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: offsetY },
      shadowOpacity: opacity,
      shadowRadius,
      elevation: androidElevation,
    },
  }) as ViewStyle;

/**
 * e0 = flat (hairline border only). In dark mode prefer stepping the surface
 * color (surface -> surfaceRaised) over stronger shadows.
 */
export const elevation = {
  e1: shadow(1, 3, 0.06, 2), // cards
  e2: shadow(4, 12, 0.1, 6), // sticky bars, popovers
  e3: shadow(12, 32, 0.18, 16), // modals, sheets
} as const;

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

export const motion = {
  /** Hover/press states, chip toggles. */
  fast: 150,
  /** Crossfades, accordion, tab content (enter; exits ~150ms). */
  base: 220,
  exit: 150,
  /** Bottom sheets & dialogs (scale 0.96 -> 1 + fade). */
  spring: { damping: 28, stiffness: 260 },
  /** List/dashboard entrance stagger; cap at 6 items. */
  staggerPerItem: 40,
  staggerMax: 6,
} as const;

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

export interface Tokens {
  colors: ColorTokens;
  type: typeof type;
  space: typeof space;
  radius: typeof radius;
  elevation: typeof elevation;
  motion: typeof motion;
  isDark: boolean;
}

export const getTokens = (isDark: boolean): Tokens => ({
  colors: isDark ? darkColors : lightColors,
  type,
  space,
  radius,
  elevation,
  motion,
  isDark,
});
