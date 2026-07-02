# BudgetFlow — Design Context (Master)

> **Status:** Approved design source of truth for the BudgetFlow redesign.
> **Scope:** Full UI/UX audit of the current app + complete redesign specification.
> **Platforms:** iOS, Android (Expo native), Web (react-native-web, PWA) — mobile, tablet, desktop.
> **Rule:** When building any screen, read this file first. Page-specific overrides may be added later under `design/pages/<page>.md`; if such a file exists it wins over this master.
> **Functionality constraint:** The redesign retains 100% of current functionality — multi-budget, people & income, household/personal expenses, category tags, debt tagging, recurring + end dates, filters, budget lock, tools/calculator, currency, light/dark theme, Supabase auth & sync.

---

# Part 1 — Audit of the Current Design

## 1.1 Summary verdict

The app is feature-complete and structurally sound (theme context, themed styles hook, reusable header/button/card), but the visual language reads **"tech demo"** rather than **"trusted money tool"**: a three-color neon gradient brand (purple→blue→cyan), glow drop-shadows, per-screen ad-hoc styling, and micro-typography. Responsiveness is a single 768px fork with duplicated render trees rather than one adaptive layout. Accessibility has systemic gaps (10–11px text, icon-only controls without labels, color-only meaning, no reduced-motion support).

## 1.2 Findings by area

### Brand & style
| # | Severity | Finding |
|---|----------|---------|
| B1 | High | Brand gradient `#7C3AED → #2563EB → #0891B2` + multi-layer `drop-shadow` glows (Button, headers, logo, auth card) reads crypto/gaming, not household finance. Three competing hues dilute hierarchy: nothing is "the" brand color. |
| B2 | High | Semantic collision: `household` = purple = `primary`, `personal` = blue = `secondary`. Category meaning and interaction meaning share colors, so a purple element could be "primary action", "household", or "brand". |
| B3 | Medium | Gradient primary buttons + glow + hover scale/translate on every CTA — heavy treatment applied indiscriminately; primary/secondary/outline hierarchy is weak because everything glows. |
| B4 | Low | Info "ⓘ" bubble buttons beside every dashboard section title add chrome and imply the UI can't explain itself. |

### Design tokens
| # | Severity | Finding |
|---|----------|---------|
| T1 | High | Only ~16 color tokens; no surface tiers (just `background`/`backgroundAlt`), no `on-*` colors, no subtle/strong border pair. Alpha-suffix hacks everywhere (`primary + '15'`, `error + '10'`, `+ '40'`) form an unmanaged shadow palette of ~30 accidental colors. |
| T2 | High | No spacing, radius, typography, elevation, or motion tokens. Values are inline: `padding: 32`, `fontSize: 26`, `borderRadius: 22`, `marginBottom: 140`… Font sizes found in use: 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 26, 28, 32, 36 (no scale). |
| T3 | High | Two parallel style systems: static `styles/commonStyles.ts` (light-only colors, still imported in places) and `hooks/useThemedStyles.ts` (themed). Anything using the static file is broken in dark mode and the two have already drifted (e.g. card padding 24 vs 15). |
| T4 | Medium | `fontFamily: 'Inter'` is set for iOS but Inter is never bundled via `expo-font` — iOS silently falls back to system font, so web and iOS render differently. Web loads Inter from Google Fonts in `index.html`. |

### Typography
| # | Severity | Finding |
|---|----------|---------|
| Y1 | High | Body/metadata text at 10–11px (ExpenseCard tags, frequency line, expiry badge, `/mo` amounts) — below the 12px accessibility floor and genuinely hard to read. |
| Y2 | Medium | Page titles are centered (`title` token) while section headers are left-aligned at `fontSize: 26` and the screen header renders the same words again at 20px — duplicated title hierarchy on most screens. |
| Y3 | Medium | Currency amounts (the most important data in the app) get no special treatment: no tabular numerals, inconsistent sizes (16 in cards, 22/28 in KPIs), color varies by context. |
| Y4 | Low | Letter-spacing −1 on 28px titles is aggressive; `letterSpacing: 0.5` on button text fights Inter's metrics. |

### Layout & responsiveness
| # | Severity | Finding |
|---|----------|---------|
| L1 | High | One breakpoint (768px), re-derived independently in ≥4 files (`isDesktop = width >= 768`, `isPad` heuristic in useThemedStyles, OverviewSection, useDesktopModals, AuthGuard). A 768px iPad portrait gets the 280px desktop sidebar, squeezing content to ~488px. |
| L2 | High | No max content width: cards are `width: '100%'` so on a 1440p+ monitor, rows and KPIs stretch edge-to-edge (unreadable line lengths, giant empty cards). |
| L3 | High | Desktop and mobile are **duplicated JSX trees** (index.tsx renders the entire dashboard twice ~lines 1030–1230 and 1275–1470; tools.tsx same pattern) — divergence guaranteed. |
| L4 | Medium | Magic clearances: `scrollContent paddingBottom: 140`, `nativeTabContainer paddingBottom: 100 (native)`, `paddingBottom: 120` inline — the fixed tab bar's height is compensated by guesswork in each screen. |
| L5 | Medium | Two divergent UX paths for the same tasks: desktop (≥768 web) uses centered modals via `useDesktopModals`; everything else navigates to full-screen routes (`/add-expense`). Behavior, validation, and titles must be maintained twice. |

### Navigation
| # | Severity | Finding |
|---|----------|---------|
| N1 | High | iOS bottom tabs are icon-only (labels rendered only on Android) — violates icon+label guidance and makes Tools/Settings ambiguous. |
| N2 | High | Tab presses use `router.replace` — destroys web history; browser Back skips over tab switches. Desktop modals never change the URL (no deep link to Add Expense). |
| N3 | Medium | The tab bar is *hidden* on sub-pages and on home when no budgets exist — the primary navigation disappears, violating persistent-nav; users must rely on back buttons. |
| N4 | Medium | Sign-out lives inside the sidebar footer with a native `window.confirm()` — jarring, unthemed, and adjacent to normal nav items (destructive-separation violation). |
| N5 | Low | Header shows a centered title on desktop even though the sidebar already states location — double chrome. |

### Components
| # | Severity | Finding |
|---|----------|---------|
| C1 | High | Icon-only controls lack `accessibilityLabel` almost everywhere: header round buttons, trash button on ExpenseCard, ⓘ buttons, tab items (iOS), sidebar quick actions. Only `Button` sets a label. |
| C2 | High | ExpenseCard delete: 14px icon in a ~26px target (below 44pt), requires precision tap, and sits inside a pressable card (nested-target conflict). Category meaning is border-color-only (purple vs blue left edge). |
| C3 | Medium | Button disabled state = `textSecondary + '40'` background with textSecondary label — fails contrast; also no keyboard focus ring on web for any Pressable. |
| C4 | Medium | ExpenseFilterModal is 1,166 lines — six filter dimensions buried in one modal; no applied-filter chips visible on the list screen itself (state is invisible after closing). |
| C5 | Low | Loading = text "Loading..."; no skeletons. Empty states exist but are icon+text only, without a clear single CTA in some screens. |

### Motion & feedback
| # | Severity | Finding |
|---|----------|---------|
| M1 | Medium | Infinite floating-circle animation runs behind the auth screen forever (battery/CPU); no `prefers-reduced-motion` respect anywhere in the app. |
| M2 | Low | Hover transforms (translateY −2, scale 1.02, translateX 4) are applied per-component with inline `transitionDuration` strings — inconsistent rhythm; some elements move, some don't. |
| M3 | Low | No entrance/stagger animation on lists or dashboards; screens pop in fully formed after a 100ms artificial delay (flicker hack in `_layout.tsx`). |

### Dark mode
- Structurally supported (token pairs + system/light/dark modes — good).
- `#020617` page background against `#1E293B` borders is near-invisible separation; cards rely on shadows that barely register on dark.
- Alpha-suffix colors (`primary + '15'`) produce different perceived colors in dark mode than light — unaudited.
- Static `commonStyles` usages render light-mode colors in dark mode (T3).

## 1.3 What's worth keeping
- The information architecture: 5 top-level destinations (Overview, Expenses, People, Tools, Settings) is right and maps to a bottom bar and sidebar cleanly.
- Theme context with system/light/dark modes; toast system; StandardHeader's slot API (left/right button arrays); ExpenseForm/PersonForm extraction; onboarding intent (name budget → guided next steps).
- The dashboard's *content* (Overview KPIs, Individual Breakdowns, Expense Breakdown, Debt, Expiring) — the sections are the right ones; only their presentation and duplication need work.

---

# Part 2 — The Redesign

## 2.0 Design direction: **"Calm Ledger"**

A quiet, confident money tool. One brand hue (evolved from the current purple, so the identity is refined rather than replaced), warm-neutral surfaces, generous whitespace, soft single-source elevation, crisp numerals. The **numbers are the interface** — everything else recedes.

Principles (test every screen against these):
1. **One accent.** Indigo is the only interactive/brand hue. Green/red are reserved exclusively for money-in/money-out. If something glows, it's the primary action, and there is exactly one per screen.
2. **Numerals first.** Amounts are the largest, highest-contrast elements, always tabular-figured, always formatted by the currency hook.
3. **Same skeleton everywhere.** One layout tree per screen that adapts by grid — never two JSX trees. Mobile, tablet, and desktop are the *same* screen at different densities.
4. **Meaning never by color alone.** Every semantic color is paired with an icon or label.
5. **Chrome earns its place.** No decorative gradients, no glow shadows, no ⓘ buttons — captions and clear labels instead.

## 2.1 Color tokens

Replace `colors`/`darkColors` in full. All pairs meet WCAG AA at their intended usage size (body ≥ 4.5:1, large text/icons ≥ 3:1).

### Light
| Token | Value | Usage |
|---|---|---|
| `brand` | `#4F46E5` | Primary actions, active nav, focus ring (6.3:1 on white) |
| `onBrand` | `#FFFFFF` | Text/icon on brand |
| `brandSubtle` | `#EEF2FF` | Selected/active fills, chips |
| `onBrandSubtle` | `#3730A3` | Text on brandSubtle (8.9:1) |
| `bg` | `#F8FAFC` | Page background |
| `surface` | `#FFFFFF` | Cards, sheets, bars |
| `surfaceSunken` | `#F1F5F9` | Inset wells, segmented track, input bg |
| `text` | `#0F172A` | Primary text (16.9:1) |
| `textMuted` | `#475569` | Secondary text (7.5:1 — replaces #6B7280) |
| `textFaint` | `#64748B` | Tertiary/captions ≥14px only (4.8:1) |
| `border` | `#E2E8F0` | Hairlines, dividers |
| `borderStrong` | `#CBD5E1` | Input borders, emphasized dividers |
| `income` | `#047857` | Money in (5.9:1) — always with ↑ or label |
| `incomeSubtle` | `#ECFDF5` | Income fills |
| `expense` | `#BE123C` | Money out (6.5:1) — always with ↓ or label |
| `expenseSubtle` | `#FFF1F2` | Expense fills |
| `warning` | `#B45309` | Expiring soon (5.0:1) |
| `warningSubtle` | `#FFFBEB` | Warning fills |
| `danger` | `#DC2626` | Destructive actions only (4.5:1) |
| `dangerSubtle` | `#FEF2F2` | Danger fills |
| `household` | `#4338CA` | Household chip text+icon (7.7:1) |
| `personal` | `#0E7490` | Personal chip text+icon (5.3:1) |
| `overlay` | `rgba(15,23,42,0.5)` | Modal scrim |

### Dark
| Token | Value | Usage |
|---|---|---|
| `brand` | `#818CF8` | 7.0:1 on surface |
| `onBrand` | `#1E1B4B` | Dark text on light-indigo buttons |
| `brandSubtle` | `#312E81` (40% opacity fill: `#312E8166`) | Selected fills |
| `onBrandSubtle` | `#C7D2FE` | |
| `bg` | `#0B1220` | Page background (slightly warm-navy; not pure black) |
| `surface` | `#151E2E` | Cards — one visible step above bg |
| `surfaceSunken` | `#0F1726` | Wells, inputs |
| `text` | `#F1F5F9` | 15.5:1 |
| `textMuted` | `#94A3B8` | 6.4:1 |
| `textFaint` | `#7C8BA1` | ≥14px only |
| `border` | `#293548` | Visible against both bg and surface |
| `borderStrong` | `#3B4A63` | |
| `income` | `#34D399` | with ↑/label |
| `incomeSubtle` | `#064E3B4D` | |
| `expense` | `#FB7185` | with ↓/label |
| `expenseSubtle` | `#88133756` | |
| `warning` | `#FBBF24` | |
| `warningSubtle` | `#78350F4D` | |
| `danger` | `#F87171` | |
| `dangerSubtle` | `#7F1D1D4D` | |
| `household` | `#A5B4FC` | |
| `personal` | `#67E8F9` | |
| `overlay` | `rgba(2,6,23,0.65)` | |

Rules:
- **Delete** the `brandGradient` token and every `filter: drop-shadow(...)` glow. The only permitted gradient is an optional subtle `surface → brandSubtle` wash on the single hero KPI card.
- **Ban** alpha-suffix color math (`color + '15'`). Every fill must be a named `*Subtle` token.
- `household`/`personal` colors may only appear inside chips that also carry an icon (`home` / `person`) and a text label.

## 2.2 Typography

**Family:** Inter everywhere, properly loaded via `expo-font` (`@expo-google-fonts/inter`: 400, 500, 600, 700) so iOS/Android/web match. Keep the Google Fonts `<link>` for web fallback.

**Scale & roles** (single source; no other font sizes permitted):

| Token | Size/Line | Weight | Usage |
|---|---|---|---|
| `display` | 34/40 | 700 | Hero KPI amount only |
| `h1` | 28/34 | 700 | Screen titles (left-aligned, never centered except empty/onboarding states) |
| `h2` | 22/28 | 600 | Section titles |
| `h3` | 17/24 | 600 | Card titles, list item primary |
| `body` | 16/24 | 400 | Default text, inputs |
| `bodyMed` | 16/24 | 500 | Emphasized body, buttons |
| `caption` | 13/18 | 500 | Metadata, helper text, chip labels |
| `overline` | 12/16 | 600 | UPPERCASE eyebrow labels, +0.6 tracking |

- **Floor: 12px.** Nothing below `overline`. (Kills all 10–11px text.)
- **Amounts:** always `fontVariant: ['tabular-nums']`; decimals may render at 0.7× size/`textMuted` in KPIs (e.g. **£1,240**.50).
- Letter-spacing: −0.5 on `display`/`h1` only; 0 elsewhere (remove the −1 and +0.5 cases).
- Support Dynamic Type: sizes above are the 1.0× base; test at 1.3× with no truncation of amounts (wrap, don't clip).

## 2.3 Space, radius, elevation

| System | Tokens |
|---|---|
| Spacing (4pt) | `s1:4 s2:8 s3:12 s4:16 s5:20 s6:24 s7:32 s8:40 s9:48 s10:64` |
| Radius | `rSm:8` (chips, inputs) · `rMd:12` (buttons, list rows) · `rLg:16` (cards) · `rXl:24` (sheets, hero) · `rFull` (avatars, pills) |
| Elevation | `e0` flat/hairline border only · `e1` cards: `0 1px 3px rgba(15,23,42,0.06)` + border · `e2` sticky bars/popover: `0 4px 12px rgba(15,23,42,0.10)` · `e3` modals/sheets: `0 12px 32px rgba(15,23,42,0.18)` |

- Dark mode elevation = **surface color steps**, not bigger shadows (`bg → surface → +4% lightness` for e2/e3).
- Screen padding: 16 (compact) / 24 (medium) / 32 (expanded). Card padding: 16 / 20 / 24. Section gap: 32 fixed. Card-internal row gap: 12.
- Icons: Ionicons (already used) at 16/20/24 only, stroke ("-outline") set for inactive, filled for active states. Never emoji.

## 2.4 Motion

| Token | Value |
|---|---|
| `fast` | 150ms, ease-out — hover/press states, chip toggles |
| `base` | 220ms, ease-out enter / ease-in exit (~150ms) — crossfades, accordion, tab content |
| `sheet` | spring (damping 28, stiffness 260) — bottom sheets, dialogs (scale 0.96→1 + fade) |
| `stagger` | 40ms/item, max 6 items — dashboard cards & list entrance |

Rules: animate transform/opacity only; exactly one attention animation per screen; **respect `prefers-reduced-motion` / `AccessibilityInfo.isReduceMotionEnabled`** globally (disable stagger, springs → 150ms fades); delete the auth screen's infinite floating circles (replace with static radial tint); press feedback within 100ms on all touchables (opacity 0.85 or scale 0.98).

## 2.5 Responsive layout system

Breakpoints (single source `useBreakpoint()` hook — delete all scattered `width >= 768` checks):

| Class | Width | Nav | Content |
|---|---|---|---|
| **compact** | < 640 | Bottom tab bar (5 items, icons **and** labels, always visible incl. sub-screens) | Single column, 16px gutters, full-bleed lists |
| **medium** (tablet portrait / landscape phones) | 640–1023 | **Icon+label nav rail, 84px**, left edge (not the 280px sidebar) | Content max 720 centered; dashboard 2-col grid; forms max 560 |
| **expanded** | ≥ 1024 | Full sidebar 264px (nav + budget switcher + account) | Content max **1120** centered, 32px gutters; dashboard 12-col grid |

Non-negotiables:
- One JSX tree per screen; breakpoint changes grid/columns via style only (fixes L3).
- Tab-bar/rail heights exported as constants; scroll insets derive from them + safe-area (`contentInset = TAB_BAR_HEIGHT + insets.bottom + s4`) — no more magic 140/120/100.
- Web: `dvh`-based full height; the existing sticky header pattern is kept; no horizontal scroll at 375px; test at 375 / 640 / 768 / 1024 / 1280 / 1536.
- Navigation switches `router.replace` → `router.push`-equivalent tab navigation with preserved history on web (N2); Add/Edit flows get URL state (`/expenses/new`) so desktop dialogs are deep-linkable.

### Unified add/edit pattern (fixes L5)
One `<FormSheet>` primitive hosts ExpenseForm/PersonForm/IncomeForm on all platforms:
- compact → full-height **bottom sheet** (drag handle, swipe-down dismiss w/ dirty-check confirm)
- medium → centered dialog, max 560
- expanded → centered dialog, max 600
Route-driven (`/expenses/new`, `/expenses/:id/edit`), so back button/deep links behave identically everywhere. Delete `useDesktopModals` divergence.

## 2.6 Navigation redesign

**Compact bottom bar:** Overview · Expenses · People · Tools · Settings — labels on **all** platforms (11px min is banned; use `overline` 12/16). Active = filled icon + `brand` + 3px top indicator dot. Bar: `surface` at 92% opacity + blur, hairline top border, height 56 + safe-area. Never hidden (N3): sub-screens keep the bar; the "no budgets" state keeps Settings reachable.

**Medium rail:** 84px wide, icons 24 + 12px labels stacked, same order; FAB-style "＋ Expense" pinned at rail bottom.

**Expanded sidebar:** 264px. Sections: (1) logo + budget switcher (current budget name + chevron opens switcher popover — replaces buried Settings entry), (2) nav list (icon + label, `brandSubtle` active pill), (3) "＋ Add expense" primary button, (4) footer: theme toggle + account row (avatar-initial, email) → menu with Sign out (destructive, in-app themed confirm dialog — no `window.confirm`, fixes N4).

**Headers:** compact/medium keep a slim 56px header: left-aligned `h1` title (no centered duplication — Y2/N5), right-side action slot. Expanded: no header bar; the page begins with `h1` + caption inline over content; primary page action sits top-right of the content column.

## 2.7 Screen blueprints

Every screen keeps its exact current capabilities; only presentation changes.

### Overview (Home)
- **Hero card** (full width; the one allowed gradient wash): overline "LEFT TO SPEND · MONTHLY", `display` amount (remaining), caption below "Income £X · Expenses £Y", and the Daily/Monthly/Yearly **segmented control** top-right (compact: below amount). Positive remaining = `income` accent bar; negative = `expense` + explanatory caption.
- **Stat row**: Income / Expenses / Household / Personal as 4 stat cards — compact: 2×2 grid; medium: 4-across; expanded: hero spans 12 cols, stats 3 cols each beneath.
- **Sections** (Individual Breakdowns, Expense Breakdown, Debt Repayments, Expiring Soon): `h2` + one-line `caption` subtitle (replaces every ⓘ modal — B4); expanded lays them out on the 12-col grid: Individual 7 + Expense Breakdown 5, Debt 6 + Expiring 6; compact stacks.
- Individual breakdown person cards: avatar initial-circle, name `h3`, remaining amount right-aligned tabular; a single **stacked allocation bar** (personal / household-share / left) with icon+label legend; tap → person detail.
- Empty/onboarding: keep the two-step flow, restyled: centered column max 480, one primary CTA per step, progress dots, no glow logo.

### Expenses
- Header row: title + count caption; **search field** and **filter button with active-count badge** (`Filter · 3`); applied filters render as **dismissible chips in a horizontal row under the search bar** (fixes invisible filter state, C4). Filter panel: compact = bottom sheet with grouped sections (Type, Category, Person, Debt, End date); expanded = right-side popover panel 320px.
- List: **FlatList (virtualized)**, grouped by category tag with sticky `overline` section headers + per-group subtotal. Rows replace the current card: 64px min height — left: category glyph in 36px `surfaceSunken` circle; middle: description `h3` (1 line) + caption line "Monthly · Sam · ends 12 Mar" (12px floor respected); chips only for household/personal (icon+label) and debt; right: amount `bodyMed` tabular + `/mo` caption when frequency ≠ monthly.
- Row actions: compact = swipe-left reveals Edit / Delete (64px targets) + **undo toast** on delete; expanded = hover reveals inline icon buttons (36px, labeled). Delete always confirms via themed dialog *or* offers undo — never both. Row tap = edit. (Fixes C2 nested/precision targets.)
- Expanded layout: list max 760 + right rail 320 with mini summary (total monthly, by-category top 5) — same components as Overview, no duplicate tree.

### People
- Grid of person cards: compact 1-col, medium 2, expanded 3. Card: avatar, name `h3`, income total (income color + ↑), expense count caption, chevron. Detail (route or dialog by class): income sources list (same row primitive as expenses) + person's expenses; add income = FormSheet.

### Tools
- Card grid of tools (currently one): icon, name, one-line description. Credit-card payoff calculator: form column (max 560) with currency/percent inputs; **results as stat cards + schedule table** — table on expanded (tabular numerals, right-aligned figures, zebra hairlines), stacked cards per-month on compact. Charts (if added later) follow §2.9.

### Settings
- Single grouped-list pattern on all classes (compact: full-width rows; medium/expanded: content max 720 with left anchor menu on expanded only). Groups: **Budgets** (list, create, rename, duplicate, delete, lock w/ per-budget auto-lock), **Preferences** (Currency — searchable sheet; Theme — segmented System/Light/Dark), **Account** (email, sign out), **Data** (Danger zone: clear data — `danger` styling, isolated card, typed-confirm dialog), **About**.
- Kill the login-form-inside-settings duplicate: unauthenticated users only ever see the Auth screen.

### Auth
- Static clean layout: logo (flat, no glow), `h1` "Budget Flow", card max 420 centered with vertical rhythm on `bg` (no floating animated circles — M1); segmented Login/Register; email + password with floating-label inputs, password visibility toggle, `new-password` autocomplete on register, forgot-password link (Supabase reset), inline field errors on blur, submit button full-width with loading spinner. Trust footer: lock icon + "Your data is protected with row-level security" (accurate claim).

### Budget lock (gate)
- Full-screen `bg` with centered lock icon in `surfaceSunken` circle, budget name, "Unlock with Face ID / passcode" primary button, "Switch budget" text button.

## 2.8 Component specifications

| Component | Spec |
|---|---|
| **Button** | Variants: `primary` (brand fill, onBrand text), `secondary` (`surfaceSunken` fill, text), `outline` (1.5px borderStrong), `ghost` (text-only), `destructive` (danger fill). Sizes: `md` 44px, `lg` 52px; radius `rMd`; `bodyMed` label. States: hover = 8% darken (no scale/translate); press = 0.98 scale + 12% darken; focus-visible = 2px `brand` ring offset 2 (web); disabled = 40% opacity fill + `textFaint` label (no color math); loading = spinner replaces label, width locked. Icon+label spacing 8. **No gradients, no glow.** |
| **Input** | 48px min height, `surfaceSunken` fill, 1px borderStrong, radius `rSm`; label above (`caption`, textMuted) — never placeholder-only; focus = `brand` border + ring; error = `danger` border + caption below with icon; helper text slot; correct `keyboardType`/`autoComplete` per field. CurrencyInput: prefix symbol slot, tabular numerals, `decimal-pad`. |
| **Card** | `surface`, radius `rLg`, e1, padding per §2.3. Optional header row (title `h3` + action slot). No colored borders except 3px **left accent strip** variant for warning/expired states (paired with icon+label). |
| **StatCard** | Overline label + icon chip (20px, subtle fill) · `h1`-sized tabular amount · optional caption delta. Semantic coloring only on the amount, never the card bg (except hero). |
| **ListRow** | 64px min, leading glyph circle 36, primary+caption text block, trailing value/chevron; hairline separators inset to text; pressed = `surfaceSunken`; entire row is one target — inner actions only via swipe (compact) or hover-revealed 36px labeled icon buttons (pointer devices). |
| **Chip** | 28px height, radius `rFull`, icon 14 + `caption` label; selected = `brandSubtle`/`onBrandSubtle`; filter chips get a 16px ✕ (whole chip is the dismiss target, ≥44px with hitSlop). |
| **SegmentedControl** | Track `surfaceSunken` radius `rMd` padding 2; active segment `surface` + e1 + `bodyMed`; animates position 220ms; keyboard arrows on web. |
| **FormSheet** | See §2.5. Sheet: radius `rXl` top corners, drag handle 36×4, title `h2` + close (44px, labeled), footer sticky: primary + ghost cancel, safe-area padded, e3, `overlay` scrim (tap-outside dismiss w/ dirty confirm). |
| **Dialog (confirm)** | Max 400, title `h3`, body `body` textMuted, actions right-aligned (ghost cancel + primary/destructive). Destructive delete of budget requires typing budget name. |
| **Toast** | Bottom (above tab bar), `surface` e2, icon by severity, auto-dismiss 4s, optional action ("Undo"), `aria-live=polite`, never steals focus. |
| **EmptyState** | 64px icon in subtle circle, `h3` title, one caption line, one primary CTA. Per-screen copy defined with the screen. |
| **Skeleton** | Replace "Loading..." text: shimmer blocks matching final layout (hero card, stat row, 3 rows) for loads >300ms; respect reduced-motion (static blocks). |
| **Avatar** | Initial on deterministic per-person hue (from a fixed 8-hue accessible set), `rFull`, sizes 28/36/44. |

## 2.9 Charts & data-viz rules
Allocation bars (stacked horizontal) are the default viz; donut only if categories ≤5. Colors from a fixed ordered palette (indigo, cyan, amber, rose, emerald, slate) with icon/pattern + always a legend with values; every chart has a text summary line for screen readers; tooltips on tap/hover with exact formatted values; empty chart = EmptyState, not blank axes.

## 2.10 Accessibility contract (blocking, not advisory)
1. Every interactive element: ≥44×44pt target (hitSlop where visual is smaller) and `accessibilityRole` + `accessibilityLabel` (icon-only ⇒ label mandatory).
2. Text ≥12px; body ≥16px; contrast per §2.1 pairs only.
3. Color never sole carrier — icons/labels accompany income/expense/household/personal/warning states.
4. Web keyboard: visible focus ring (2px brand) on all interactives, logical tab order, Esc closes sheets/dialogs, focus trapped in modals and returned on close.
5. Reduced motion honored globally (§2.4). Dynamic Type to 1.3× without amount truncation.
6. Screen-reader pass per screen: headings exposed (`accessibilityRole="header"`), amounts read with currency, list rows read as single sentence ("Rent, £950 monthly, household, ends March 12").

## 2.11 Implementation roadmap

| Phase | Status | Scope | Files (indicative) |
|---|---|---|---|
| **1. Foundations** | ✅ Done | New tokens (`styles/tokens.ts`), `useBreakpoint()`, Inter via expo-font, `commonStyles.ts` reduced to a palette shim mapping legacy keys → token values | `styles/`, `hooks/useTheme.ts`, `hooks/useThemedStyles.ts`, `app/_layout.tsx` |
| **2. Primitives** | ✅ Done | Card, StatCard, Chip, Avatar, Input, SegmentedControl, ListRow, EmptyState, Skeleton, ConfirmDialog, AmountText in `components/ui/`; Button rewritten in place (flat, no gradient/glow); Toast restyled to surface card, bottom-anchored | `components/ui/*`, `components/Button.tsx`, `components/Toast*.tsx` |
| **3. Navigation shell** | ✅ Done | BottomTabBar (labels on all platforms, never hidden), NavRail (84px, medium), Sidebar (264px, expanded, budget switcher + themed sign-out), slim StandardHeader (left-aligned title, labeled 44px buttons), `router.navigate` tabs | `components/nav/*`, `app/_layout.tsx`, `components/StandardHeader.tsx` |
| **4. Screens** | ◐ Core done | Global recolor via palette shim (all screens); OverviewSection → hero + stat grid; ExpenseCard rewritten (12px floor, chips, 44pt delete); AuthGuard rewritten (no infinite animation, Input/Segmented primitives, reset-password); settings sign-out → ConfirmDialog; welcome glow removed. **Remaining:** see debt list below | `app/*.tsx`, `components/*` |
| **5. Polish & QA** | Pending | Motion pass, skeletons in screens, full a11y audit per §2.10, full QA matrix | — |

### Known remaining debt (Phase 4/5 follow-ups)
- `app/index.tsx` and `app/tools.tsx` still hold duplicated desktop/mobile JSX trees (recolored but not unified); ⓘ info-modal buttons remain on dashboard sections.
- `app/expenses.tsx` still uses ScrollView + `.map` (no FlatList virtualization); its desktop table is legacy-styled; filter state chips not yet surfaced on the list screen.
- `useDesktopModals` still powers desktop add/edit dialogs; the route-driven FormSheet unification (§2.5) is not yet applied, so those dialogs aren't deep-linkable.
- Legacy `currentColors` palette shim still consumed by unmigrated screens; delete `styles/commonStyles.ts` when the last consumer migrates.
- Section components (IndividualBreakdowns, ExpenseBreakdown, Debt, Expiring, RecurringWidget) inherit tokens via themedStyles but keep legacy internals (incl. some LinearGradient uses).

### QA matrix (definition of "works flawlessly")
Viewports 375 / 390 / 640 / 768 / 1024 / 1280 / 1536 × light+dark × (web: Safari+Chrome; native: iOS+Android) × portrait+landscape (≤1024). Zero horizontal scroll, zero content under bars, all targets ≥44pt, VoiceOver/TalkBack walkthrough of Overview + add-expense flow, Dynamic Type 1.3×, reduced-motion on.

---

*Written 2026-07-02. Amend this file rather than diverging in code; page-level overrides belong in `design/pages/`.*
