/**
 * LEGACY palette shim — "Calm Ledger" values under the old key names.
 *
 * The design source of truth is design/DESIGN.md and styles/tokens.ts
 * (available as `tokens` from useTheme()). This file exists only so
 * unmigrated screens that still read `currentColors.<legacyKey>` render in
 * the new palette. Keys are frozen; values mirror tokens.ts. Delete this file
 * once every screen uses `tokens` directly.
 *
 * NOTE: values must stay 6-digit hex — legacy code builds subtle fills via
 * alpha suffixes (`primary + '15'`), which breaks on rgba()/8-digit values.
 */

import { lightColors, darkColors as darkTokens } from './tokens';

export const colors = {
  primary: lightColors.brand,
  secondary: lightColors.personal,
  accent: lightColors.brand,
  income: lightColors.income,
  expense: lightColors.expense,
  text: lightColors.text,
  textSecondary: lightColors.textMuted,
  border: lightColors.border,
  background: lightColors.bg,
  backgroundAlt: lightColors.surface,
  info: lightColors.brand,
  warning: lightColors.warning,
  error: lightColors.danger,
  success: lightColors.income,
  household: lightColors.household,
  personal: lightColors.personal,
  cardShadow: 'rgba(15, 23, 42, 0.06)',
  // Gradients are retired (DESIGN.md §2.1): legacy gradient consumers render flat brand.
  brandGradient: [lightColors.brand, lightColors.brand, lightColors.brand],
};

export const darkColors = {
  primary: darkTokens.brand,
  secondary: darkTokens.personal,
  accent: darkTokens.brand,
  income: darkTokens.income,
  expense: darkTokens.expense,
  text: darkTokens.text,
  textSecondary: darkTokens.textMuted,
  border: darkTokens.border,
  background: darkTokens.bg,
  backgroundAlt: darkTokens.surface,
  info: darkTokens.brand,
  warning: darkTokens.warning,
  error: darkTokens.danger,
  success: darkTokens.income,
  household: darkTokens.household,
  personal: darkTokens.personal,
  cardShadow: 'rgba(0, 0, 0, 0.5)',
  brandGradient: [darkTokens.brand, darkTokens.brand, darkTokens.brand],
};
