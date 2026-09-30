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
  /** Editable field fill (inputs, date fields). White in light mode so fields don't read as read-only on the grey page. */
  field: string;
  text: string;
  textMuted: string;
  /** Tertiary text — only legal at >=14px sizes. */
  textFaint: string;
  border: string;
  borderStrong: string;
  income: string;
  onIncome: string;
  incomeSubtle: string;
  expense: string;
  expenseSubtle: string;
  warning: string;
  warningSubtle: string;
  danger: string;
  onDanger: string;
  dangerSubtle: string;
  household: string;
  onHousehold: string;
  householdSubtle: string;
  personal: string;
  onPersonal: string;
  personalSubtle: string;
  /**
   * Debt-type accents (mortgage purple, loan cyan, credit card pink); always
   * pair with an icon or label. Chosen to avoid brand and semantic hues.
   */
  mortgage: string;
  mortgageSubtle: string;
  creditCard: string;
  creditCardSubtle: string;
  loan: string;
  loanSubtle: string;
  overlay: string;
  /** Switch knob, on and off; stays light in both modes so it reads against the brand track. */
  switchThumb: string;
  /** Translucent material for floating chrome (tab bar, sticky headers); pair with a blur. */
  chrome: string;
}

export const lightColors: ColorTokens = {
  brand: '#4F46E5',
  onBrand: '#FFFFFF',
  brandSubtle: '#EEF2FF',
  onBrandSubtle: '#3730A3',
  // Grouped-page grey: white surfaces separate from it by fill alone, so
  // cards and list groups need no stroke (Apple inset-grouped idiom).
  bg: '#F1F5F9',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#F1F5F9',
  field: '#FFFFFF',
  text: '#0F172A',
  textMuted: '#475569',
  textFaint: '#5A6A80', // >=4.5:1 on bg and surfaceSunken
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  income: '#047857',
  onIncome: '#FFFFFF',
  incomeSubtle: '#ECFDF5',
  expense: '#BE123C',
  expenseSubtle: '#FFF1F2',
  warning: '#A16207',
  warningSubtle: '#FEFCE8',
  danger: '#C81E1E',
  onDanger: '#FFFFFF',
  dangerSubtle: '#FEF2F2',
  household: '#0369A1',
  onHousehold: '#FFFFFF',
  householdSubtle: '#F0F9FF',
  personal: '#C2410C',
  onPersonal: '#FFFFFF',
  personalSubtle: '#FFF7ED',
  mortgage: '#7E22CE',
  mortgageSubtle: '#FAF5FF',
  creditCard: '#BE185D',
  creditCardSubtle: '#FDF2F8',
  loan: '#0E7490',
  loanSubtle: '#ECFEFF',
  overlay: 'rgba(15,23,42,0.5)',
  switchThumb: '#FFFFFF',
  chrome: 'rgba(255,255,255,0.72)',
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
  field: '#0F1726',
  text: '#F1F5F9',
  textMuted: '#94A3B8',
  textFaint: '#7C8BA1',
  border: '#293548',
  borderStrong: '#3B4A63',
  income: '#34D399',
  onIncome: '#022C22',
  incomeSubtle: '#064E3B4D',
  expense: '#FB7185',
  expenseSubtle: '#88133756',
  warning: '#FACC15',
  warningSubtle: '#713F124D',
  danger: '#F87171',
  onDanger: '#450A0A',
  dangerSubtle: '#7F1D1D4D',
  household: '#7DD3FC',
  onHousehold: '#082F49',
  householdSubtle: '#0C4A6E4D',
  personal: '#FB923C',
  onPersonal: '#431407',
  personalSubtle: '#7C2D124D',
  mortgage: '#C084FC',
  mortgageSubtle: '#581C874D',
  creditCard: '#F472B6',
  creditCardSubtle: '#8318434D',
  loan: '#67E8F9',
  loanSubtle: '#164E634D',
  overlay: 'rgba(2,6,23,0.65)',
  switchThumb: '#F1F5F9',
  chrome: 'rgba(21,30,46,0.72)',
};

/**
 * Avatar identity hues (initial on a tinted circle). Deliberately excludes every
 * hue that carries meaning elsewhere: brand indigo, income green, expense/danger
 * red, warning yellow, and the household (sky) / personal (orange) categories,
 * so a person's avatar never reads as a status.
 */
export interface AvatarHue {
  bg: string;
  fg: string;
}

export const lightAvatarHues: AvatarHue[] = [
  { bg: '#F5F3FF', fg: '#5B21B6' }, // violet
  { bg: '#F0FDFA', fg: '#115E59' }, // teal
  { bg: '#FDF4FF', fg: '#86198F' }, // fuchsia
  { bg: '#F7FEE7', fg: '#3F6212' }, // lime
  { bg: '#F1F5F9', fg: '#334155' }, // slate
  { bg: '#F5F5F4', fg: '#57534E' }, // stone
];

export const darkAvatarHues: AvatarHue[] = [
  { bg: '#4C1D9566', fg: '#DDD6FE' },
  { bg: '#134E4A66', fg: '#99F6E4' },
  { bg: '#701A7566', fg: '#F5D0FE' },
  { bg: '#36531466', fg: '#D9F99D' },
  { bg: '#33415566', fg: '#E2E8F0' },
  { bg: '#44403C66', fg: '#E7E5E4' },
];

const hashString = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
};

/**
 * A person's identity hue, stable per seed (their id). Avatars and anything
 * tagged with that person (expense chips) use it so a person reads as one colour.
 */
export const avatarHue = (seed: string, isDark: boolean): AvatarHue => {
  const hues = isDark ? darkAvatarHues : lightAvatarHues;
  return hues[hashString(seed) % hues.length];
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

/**
 * The only permitted text styles. No other font sizes are allowed.
 * Tracking is size-specific (Inter's optical metrics): tighter as size grows,
 * near zero at caption, positive only on the small uppercase overline.
 */
export const type: Record<
  'display' | 'h1' | 'h2' | 'h3' | 'body' | 'bodyMed' | 'caption' | 'overline',
  TypeToken
> = {
  display: { fontSize: 34, lineHeight: 40, letterSpacing: -0.75, ...font(700) },
  h1: { fontSize: 28, lineHeight: 34, letterSpacing: -0.6, ...font(700) },
  h2: { fontSize: 22, lineHeight: 28, letterSpacing: -0.4, ...font(600) },
  h3: { fontSize: 17, lineHeight: 24, letterSpacing: -0.2, ...font(600) },
  body: { fontSize: 16, lineHeight: 24, letterSpacing: -0.1, ...font(400) },
  bodyMed: { fontSize: 16, lineHeight: 24, letterSpacing: -0.1, ...font(500) },
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
  /** Light/dark switch: the whole screen cross-fades (ease-in-out). */
  theme: 320,
  /** Amounts counting up/down to a new value (ease-out), e.g. a period switch. */
  count: 420,
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
