# BudgetFlow UI rules (Apple HIG, adapted for React Native / Expo)

Build interfaces that feel native and calm. The design source of truth is `design/DESIGN.md` and `styles/tokens.ts` (exposed as `tokens` from `useTheme()`). These rules restate how to use them; if they ever disagree, the tokens file wins.

## Tokens only
- **Spacing:** `space.s1`–`s10` (4pt scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64). No other margin/padding/gap values.
- **Type:** `type.display | h1 | h2 | h3 | body | bodyMed | caption | overline`. No other font sizes; the floor is 12px. Apply `tabularNums` to every currency amount.
- **Radius:** `radius.sm` (chips, inputs) · `md` (buttons, rows) · `lg` (cards) · `xl` (sheets) · `full` (avatars, pills).
- **Elevation:** `elevation.e1 | e2 | e3` only. In dark mode, step the surface (`surface` → `surfaceRaised`) instead of adding shadow.
- **Motion:** `motion.fast | base | exit | spring`. Respect `useReducedMotion()`.

## Color
- Use `tokens.colors.*` only. `currentColors` / `styles/commonStyles.ts` is a retired legacy shim; do not reintroduce it.
- Never build tints with alpha suffixes (`color + '15'`). Use the named `*Subtle` token (`brandSubtle`, `dangerSubtle`, `incomeSubtle`, `warningSubtle`, `householdSubtle`, `personalSubtle`, `mortgageSubtle`, …).
- Text/icons on a solid semantic fill use its paired `on*` token (`onBrand`, `onIncome`, `onDanger`, `onHousehold`, `onPersonal`), never a hardcoded white. Dark-mode fills are light pastels, so white fails contrast there.
- Semantic color is never the only signal: pair it with an icon or label.

## Components & interaction
- Build from `components/ui` primitives and `components/Button`; don't restyle ad hoc or invent custom containers.
- Pressed state appears on press-down (Pressable `pressed` style), not on release.
- Touch targets are at least 44pt (use `hitSlop` when the visual is smaller).
- Haptics go through `utils/haptics.ts` and stay sparing: selection changes, success/error outcomes, destructive warnings. Never on every button tap. Shared primitives (SegmentedControl, Chip, ConfirmDialog, toasts) already fire them.
- Respect safe areas via `react-native-safe-area-context`.
- Verify light and dark mode for any visual change.
