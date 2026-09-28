# BudgetFlow UI Audit — Apple design lens

**Date:** 2026-09-27
**Method:** Static audit of `app/` and `components/` against Apple's design principles (fluid response, restraint, hierarchy, materials, typography, multimodal feedback), `CLAUDE.md` and `design/DESIGN.md`. Counts come from grep over the working tree. The app itself sits behind Supabase sign-in, so no signed-in screens were exercised.
**Supersedes:** the earlier "85/100, compliant" version of this file. Grep contradicts that version: token adoption is limited to the primitives and the migrated screens.

## Verdict

The **foundation is good**: named color tokens with `*Subtle`/`on*` pairs, a type scale, a 4pt spacing scale, primitives in `components/ui`, and one nav config shared across the bar, rail and sidebar. The **app on top of it is only half migrated**. The primitives look calm, but the screens people use most (Expenses, Settings, Budgets, People, the filter sheet) still use the pre-redesign idiom. The result reads as two design languages stitched together. There is also one functional bug that the redesign has to fix first.

## 0. Confirmations and errors on web

`react-native-web` implements `Alert.alert` as an empty function (`node_modules/react-native-web/dist/exports/Alert/index.js`). The PWA is the deployed product (Vercel).

- Most screens import `utils/alert.ts`, which falls back to the browser's `window.confirm`/`window.alert`. Those work, but they're unthemed system dialogs that stop the page. They also broke the app's visual language at its highest-stakes moment: deleting data.
- **`app/manage-categories.tsx` and `app/budget-lock.tsx` imported React Native's `Alert` directly.** On web, **delete category** and every validation or error message on those screens did nothing at all.

**Fix (done):** `utils/alert.ts` now routes web calls to a themed, queued `DialogHost` (`ConfirmDialog` + warning haptic). Native keeps the platform alert. Both stray screens now import the shared wrapper.

## 1. Response and feedback

| # | Sev | Finding | Apple principle |
|---|-----|---------|-----------------|
| R1 | High | **230 `TouchableOpacity`** uses in the unmigrated screens (settings 63, filter sheet 23, budgets 22, expense form 19, people 17, expenses 17). Opacity-on-release feedback with no pressed fill. | Feedback belongs on the press itself. `Pressable` + `pressed` style gives that. |
| R2 | Med | Toast enter/exit are fixed `Animated.timing` tweens. They ignore Reduce Motion and can't be swiped away. | Use springs for things that move, a cross-fade under Reduce Motion, and let the user dismiss. |
| R3 | Med | `_layout.tsx:50` holds the first render for 100 ms (`isInitialLoad`) as an anti-flicker hack. | Every artificial delay on the input path is a regression. |
| R4 | Low | `useReducedMotion` exists but only `Skeleton` reads it. | Build reduced motion into the primitives. |

## 2. Hierarchy and restraint

| # | Sev | Finding |
|---|-----|---------|
| H1 | High | **Every surface gets a border and a shadow** (`Card`, `ExpenseCard`, `StatCard`). Each card draws two edges, and a list of 40 expenses becomes 40 floating boxes. Apple separates grouped content by *fill* (a white group on a grey page) with hairline inset separators. It doesn't outline every element. |
| H2 | High | **An always-visible red trash button on every expense.** It adds 40 alarm-coloured icons to the list, and it's a second target nested inside the tappable card. Destructive actions belong one level deeper (the edit screen, a swipe, or a context menu), not in the scan path. |
| H3 | Med | Each dashboard section repeats a brand-coloured icon, an H2 and an explanatory caption. Five coloured icons compete with the hero number, which should be the only loud thing on Overview. |
| H4 | Med | `ListRow` titles use `type.h3` (17 semibold). Semibold row titles flatten the hierarchy with section headings. iOS row titles are regular or medium body; weight is for headings and key numbers. |
| H5 | Med | The Overview screen has **six full `return` trees** (`app/index.tsx` ~278–1060), one per empty and onboarding state. Each carries its own 32 px centred titles and inline font sizes, so the states drift apart visually. |
| H6 | Low | Tab labels are uppercase overline text with a 4 px dot above the icon. Tab labels should be short sentence-case words; the selected tint already marks the active tab. |

## 3. Tokens are bypassed by screens

| Violation | Count | Worst offenders |
|---|---|---|
| Raw `margin/padding/gap` numbers | ~800 | settings 194, index 96, filter sheet 82, expenses 65 |
| Raw `fontSize` | ~220 | settings 39, filter sheet 31, expenses 23, index 21 |
| Raw `fontWeight` | ~200 | settings 33, filter sheet 19, expenses 19 |
| Raw `borderRadius` | ~120 | settings 24, filter sheet 17 |
| Alpha-suffix tints (`color + '15'`) | 8 | ExpenseBreakdownSection 5, expenses 2, DebtRepayment 1 |
| Literal `white`/`black`/`rgba()` | ~33 | settings 11 |
| Hand-rolled shadows | 16 | Toast, filter sheet, settings, budgets |

Every one of these renders differently from the primitives, and most will break in dark mode or with larger text.

## 4. Typography

| # | Sev | Finding |
|---|-----|---------|
| T1 | Med | Letter-spacing is only set on `display` and `h1` (−0.5), and not at all on `h2`, `h3`, body or caption. Inter is designed for size-specific tracking. Without it, 17–22 px headings read loose next to the tight display numbers. |
| T2 | Low | `overline` is used for StatCard labels, tab labels and section eyebrows. Uppercase tracked micro-labels in three roles is a lot of shouting for a calm app. |

## 5. Materials and depth

| # | Sev | Finding |
|---|-----|---------|
| M1 | Med | `StandardHeader` is an opaque bar with a 1 px full-strength border. Apple chrome uses a hairline (`StyleSheet.hairlineWidth`) on a translucent material, so content visibly passes underneath. |
| M2 | Med | The tab bar hardcodes its translucent fill as `rgba(21,30,46,0.92)` / `rgba(255,255,255,0.92)` instead of using tokens. |
| M3 | Low | Light-mode `bg #F8FAFC` against `surface #FFFFFF` is almost the same value. That near-match is why every card needs a border and shadow to be seen at all (the root cause of H1). |

## 6. Modals and sheets

- There are 16 raw `<Modal>` instances across 8 files, each with its own scrim, radius and shadow. Four use `animationType="fade"` for what are really form sheets. Sheets should slide up from the bottom edge and return the same way (spatial consistency).
- `ExpenseFilterModal` is 1,166 lines. Applied filters aren't visible on the Expenses screen after the sheet closes (still true from DESIGN.md C4).

---

# Redesign direction: "Calm Ledger, finished"

Keep the brand, tokens and layout system. Make the whole app speak one idiom:

1. **Grouped, not boxed.** A slightly deeper grey page, white *groups* with no stroke, and hairline separators inset to the text. Borders only on inputs. Dark mode steps surfaces instead of adding shadow.
2. **One loud thing per screen.** On Overview that's the hero "left to spend" figure. Section headers become plain titles and lose the coloured icons. Semibold is reserved for headings and amounts.
3. **Destructive actions one level deeper.** Delete lives on the edit screen, behind a themed confirm. The list is for scanning.
4. **Feedback on press, motion from springs.** `Pressable` everywhere, spring toasts, cross-fades under Reduce Motion, haptics only on outcomes.
5. **Tracking by size.** Negative tracking that grows with size, 0 at body, slightly positive on the small uppercase label.

## Phasing

| Phase | Scope | Status |
|---|---|---|
| 1 | Themed web confirm and error dialog (§0); token refinements (page grey, tracking); `Card`/`ListRow`/`ListGroup` grouped style; tab bar, header and toast polish; dashboard section headers; expense rows without inline trash | **Done**: typechecks; signed-in screens not yet viewed |
| 2 | Expenses: one header, on-screen search, filter bar showing every applied filter, grouped list (compact/medium) or 8-column table (expanded); filter sheet rebuilt as one body (native page sheet on iOS, spring bottom sheet on touch web, anchored popover at medium and up) with live counts; no nested buttons; single focus ring on inputs | **Done**: viewed signed-in at 375/800/1360 in dark mode; light mode not yet viewed |
| 3 | Settings rebuilt as one inset-grouped layout at every size (2,091 → 294 lines); duplicated budget/category CRUD removed in favour of `/budgets` and `/manage-categories`; currency picker on the new shared `Sheet` primitive; `ListRow` gains `destructive`; Budgets gets a back button | **Done**: viewed signed-in, light mode, compact and desktop |
| 4 | Overview: six return trees → one shell with a state switch (loading skeleton → first budget → locked → setup checklist → dashboard); two unreachable states removed; `Skeleton` fill fixed for the page grey (1,068 → 487 lines) | **Done**: every state viewed in light mode (non-dashboard states forced temporarily in code, then reverted) |
| 5 | Budgets, Categories, People (+ income sheet), expense/person/income forms, Budget lock, Tools and all four dashboard sections rebuilt on primitives; new `ChoicePills`, `DateField`, `IconButton`, `ListRow.accessory`, `Sheet.grouped`; every modal now on `Sheet`/`ConfirmDialog`. Scan: 0 `TouchableOpacity`, 0 raw font sizes/weights, 0 alpha tints, 0 colour literals, 0 gradients (was ~230/220/200/8/33). Bugs fixed on the way: Budget lock was unreachable; Extend end date did nothing on web; person form deleted income without confirming and couldn't change frequency; Calculate stuck disabled after a stale error | **Done**: each screen viewed signed-in (light mode, phone; Expenses/Settings/Overview also desktop) |
