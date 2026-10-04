# Budget Flow — Product Requirements Document (v2)

## 1. Overview

**Budget Flow** is a cloud-native personal and household budgeting application. It lets an individual or a household track income, expenses, and budgets; understand who owes what on shared costs; and plan debt repayment — with a local-first experience that stays fast offline and syncs across devices when signed in.

- **Platforms:** Web (primary, installable PWA), iOS, and Android from a single codebase.
- **Architecture:** Web-first. One TypeScript/React codebase deployed to the web and wrapped as native iOS/Android apps.
- **Data model:** Multi-budget. Each budget owns its own people, expenses, household settings, and lock configuration.
- **Persistence:** Local-first with optional cloud sync when authenticated.
- **Currency:** 120+ world currencies for display formatting.

### 1.1 Goals

- Give a household a single, calm view of income vs. commitments and what's left to spend.
- Make shared-cost fairness explicit and automatic.
- Work fully offline; sync seamlessly and conflict-free across devices when online.
- Feel native on mobile and first-class on the web from one codebase.

### 1.2 Target Users

- Individuals tracking spending against income.
- Households / couples splitting shared expenses and settling contributions.
- Anyone managing multiple separate budgets (personal, household, side project) in one place.

### 1.3 Design Language

The product follows the **"Calm Ledger"** design system: a token-based foundation (color, spacing, typography), the Inter typeface, light/dark/system theming, and a responsive navigation shell that adapts across phone, tablet, and desktop.

---

## 2. Navigation & App Shell

A single responsive navigation shell exposes five top-level destinations, driven from one shared config and rendered per form factor:

- **Phone:** bottom tab bar.
- **Tablet:** side navigation rail.
- **Desktop / wide web:** full sidebar.

**Top-level destinations:**

| Route | Label | Purpose |
|-------|-------|---------|
| `/` | Overview | Dashboard / summary |
| `/expenses` | Expenses | Expense list, filtering, management |
| `/people` | People | Household members & income |
| `/tools` | Tools | Financial calculators |
| `/settings` | Settings | Budgets, sync, preferences |

Secondary routes: Add/Edit Expense, Edit Person, Edit Income, Budgets management, Manage Categories, Budget Lock configuration.

---

## 3. Budgets (Multi-Budget Management)

Users maintain multiple independent budgets and choose which one is active.

- **Create budget** — name a new budget; it becomes selectable and can be set active.
- **Set active budget** — Overview, Expenses, and People all operate on the active budget.
- **Rename budget** — inline.
- **Duplicate budget** — clone people, expenses, and settings into a new budget.
- **Delete budget** — guarded so the active budget cannot be deleted without first switching.
- **Budget switcher** — quick-switch between budgets.
- **First-run flow** — when no budget exists, the user is guided to name and create their first budget before reaching the dashboard.

Each budget stores: `name`, `people[]`, `expenses[]`, `householdSettings`, `createdAt`, `modifiedAt`, optional `lock`, and deletion metadata used for sync.

---

## 4. People & Income

Manage household members and their income within a budget.

- **Add / edit / remove person** (by name).
- **Add / remove income sources per person** — each income has an amount, label, and frequency (daily / weekly / monthly / yearly / one-time).
- **Per-person view** shows:
  - Monthly income (normalized from any frequency).
  - Remaining income after their share of expenses.
  - Their list of income sources.
- **Frequency normalization** — all frequencies convert to consistent annual/monthly figures for comparison.

---

## 5. Expenses

Full expense lifecycle with rich attributes, filtering, and shared-cost handling.

### 5.1 Add / Edit Expense

An expense supports:

- **Amount** (required).
- **Description.**
- **Type:** `household` (shared) or `personal` (assigned to one person).
- **Person assignment** — required for personal expenses.
- **Frequency:** daily / weekly / monthly / yearly / one-time.
- **Category tag** — from a managed list; defaults to "Misc". Default categories: Groceries, Rent, Mortgage, Loan, Credit Card, Utilities, Transport, Entertainment, Healthcare, Clothing, Takeaways, Eating Out, Savings, Investments, Misc.
- **Start date.**
- **End date** — optional, for recurring expenses (when the recurrence stops).
- **Debt repayment tag** — optional: `loan`, `mortgage`, or `credit_card`.
- **Notes** — optional.

### 5.2 Expense List & Filtering

- Expense cards for the active budget.
- **Filter panel** supporting: type (all / household / personal), category (single and multiple), person, free-text search, has-end-date, and debt-repayment filters. Category options are derived dynamically from the current expenses.

### 5.3 Active vs. Expiring Expenses

- The app derives whether a recurring expense is currently **active** from its start date and optional end date.
- An **expiring / ended section** surfaces recurring expenses ending soon (within ~30 days) or already ended, so users can review or renew them.

---

## 6. Overview Dashboard

A summary dashboard for the active budget, shown once it has at least one person and one expense.

- **"Left to spend"** headline with a **Daily / Monthly / Yearly** view-mode toggle.
- **Overview section** — income vs. expenses vs. remaining.
- **Individual breakdowns** — per-person contribution / share summaries.
- **Expense breakdown** — spending grouped by category / type.
- **Person breakdown chart** — visual split across people.
- **Debt repayment section** — expenses tagged as loan / mortgage / credit-card repayments.
- **Expiring section** — recurring expenses ending soon / ended (§5.3).
- **First-run & loading states** — a welcome experience when no data exists; loading gated to avoid flicker.

---

## 7. Household Cost Sharing

Household (shared) expenses are distributed across people by a configurable method:

- **Even split** — divided equally.
- **Income-based split** — proportional to each person's income.

The chosen method drives per-person "share of household expenses" and "remaining income" across the People and Overview screens.

---

## 8. Financial Tools

A Tools screen hosts the financial calculators as a card per tool (`/tools`); each opens its own screen (`/tools/credit-card`, `/tools/savings`, `/tools/mortgage`, `/tools/budget-review`, `/tools/debt-help`).

### Credit Card Payoff Calculator

- **Inputs:** balance, APR %, monthly payment.
- **Interest-only minimum suggestion** — computes and displays the interest-only minimum for the given balance/APR (informational).
- **Outputs:** months to payoff, total interest paid (the smaller final payment is accounted for), and the first months of the amortization schedule (payment, interest, principal, remaining balance).
- **"Never repaid" state** — clearly flagged when the payment only covers interest (or is zero) so the balance never reduces.

### Savings Growth Calculator

- **Inputs:** starting balance (optional), regular deposit with a daily / weekly / monthly frequency, yearly interest rate (an effective rate, as banks advertise it: AER / APY), time period in years (1–60, with 5/10/20/30/40 presets).
- **Live projection** (no Calculate button): final balance, what the user put in, interest earned and its share of the total.
- **Chart:** stacked area of contributions and interest over time (month resolution); drag, hover or arrow keys to read any point, tap to pin. A year-by-year table of running totals is the table twin.
- Deposits are modelled at the end of each month; the rate is held constant; tax and inflation are ignored (stated on screen).
- **Budget link:** "Use my monthly surplus" fills the deposit from income minus expenses when the active budget is unlocked and in surplus.

### Mortgage Calculator

- **Inputs:** balance still owed, yearly interest rate (fixed), years left (1–40, with 10/15/20/25/30 presets), optional extra payment each month.
- **Outputs:** monthly payment (principal and interest only, labelled as such), total interest, total paid, and the month the mortgage is cleared.
- **Extra payments:** time saved, interest saved and the new payoff date, with the balance charted against the scheduled plan.
- **Charts:** balance over time (line + wash, one line per plan) and a stacked column per year splitting principal and interest; year-by-year table.
- Monthly payments and monthly interest at a fixed rate.

Charts (`components/charts`) are drawn with `react-native-svg`. All the maths lives in `utils/projections.ts` and is unit-tested.

### Budget Review (50/30/20)

Compares the active budget with the 50/30/20 rule (Elizabeth Warren and Amelia Warren Tyagi, *All Your Worth*, 2005): 50% of take-home pay to needs, 30% to wants, 20% to savings.

- **Explains the rule on screen:** a card first on a phone and beside the results on wide screens, saying what each bucket covers, that the shares are of after-tax income, and that it is a guideline.
- **No inputs:** reads the active budget (all people and all expenses, household and personal). Shares are of total income; amounts are per month, from the same helpers as the Overview, so totals reconcile. Expenses past their end date are left out.
- **Sorting:** Needs = Rent, Mortgage, Utilities, Groceries, Transport, Healthcare, Loan, Credit Card (the app can't tell a minimum debt payment from an extra one, so debt counts as a need). Wants = Entertainment, Clothing, Takeaways, Eating Out, Misc and any custom category (flagged "custom, counts as a want" until moved). Savings = Savings, Investments. These are the defaults: any category can be moved to another bucket (below).
- **Summary:** "n of three on target", which bucket is furthest off, and two stacked bars on one scale (the 50/30/20 target above, the budget below, with an "Unallocated" segment for income not assigned to anything). Income, spending and left over (or over income by) sit beneath.
- **Bucket cards:** share of income and money per month against the target, a meter with a target tick, a status badge, the gap in money and a disclosure listing the categories (tap one to open Expenses filtered to it). Needs and Wants are ceilings and Savings is a floor; within 5 points of the target is "slightly over/under", beyond that "over/under target". Status is judged on the rounded percentage that is shown.
- **Moving a category:** tapping a category in a bucket card's list opens a sheet to choose Needs, Wants or Savings, put it back to its default, or show its expenses. The choice is stored on the budget (`categoryBuckets`, keyed by category name, last write wins per category) and syncs, so everyone sharing the budget sees the same review; the sheet says so on a shared budget. Renaming a custom category keeps its choice, deleting one clears it, and a new budget inherits the current budget's choices. Excel export and import don't carry them. A choice made on an app build older than this feature is lost the next time that build saves the budget.
- **Edge cases:** a locked budget shows an unlock prompt and computes nothing; no income, no expenses and no budget each have an empty state with a way forward; spending beyond income shows a warning, and the bars share a scale so the budget's bar runs past the target's.
- **Links:** with money left over, the banner offers an amount to put into Savings and "See what $X/mo could grow into" opens the savings calculator with that amount already in the regular deposit (monthly; the interest rate is left for the user). The amount is the unallocated money, capped at what Savings is short of its 20% target (Savings already holds counts, so it is the gap, not the full 20%), rounded down to whole units. Once Savings meets the target it is all the unallocated money, because Savings is a floor. "Copy results" copies a plain-text summary.
- Maths lives in `utils/budgetReview.ts` and is unit-tested; the bars and cards are plain views (no new native dependency).

### Debt Help (UK)

Signposts people in the UK to free, impartial debt advice. It is a list of services, not a calculator, and it does not advise.

- **Shown to UK users only:** the app has no country setting, so the Tools card appears when the currency is pounds (GBP, the default). The screen itself works at `/tools/debt-help` whatever the currency.
- **Where do you live?** England, Wales, Scotland or Northern Ireland (pills; the choice isn't saved). The list shows only the services that cover that nation, because the rules and some services differ: National Debtline doesn't cover Northern Ireland, and Citizens Advice has a separate line for England, Wales and Scotland while Advice NI covers Northern Ireland.
- **Services:** StepChange and National Debtline (charities), Citizens Advice (England, Wales or Scotland) or Advice NI, and MoneyHelper's debt advice locator (government-backed). Each card names who runs it (Charity or Government-backed), where it helps, what it does, a free phone number in the button text (so it can be read and dialled by hand where a tap can't call) and a link to its site. Opening hours are deliberately not shown; they change, so the card points to the website.
- **Around the list:** what to expect when talking to an adviser, a "Before you pay anyone" warning about fee-charging firms with a link to the FCA register, and a note that Budget Flow isn't a debt adviser, earns nothing from the links and sends nothing from a budget to these services. The note carries the date the details were last checked.
- **Data:** the services are hand-checked constants in `utils/debtHelp.ts` (`CHECKED_ON` says when). A unit test keeps the links `https`, the numbers free (0800/0808) and unique, and each nation's list sensible. Links and calls go through `utils/openLink.ts`, which allows only `https:` and `tel:`.
- **Not done:** no affiliate or referral links, no tracking, and nothing is read from the budget on this screen.

## 9. Categories Management

- Ships with a default category list (§5.1).
- Managed via a dedicated Manage Categories screen and the Categories section in Settings.
- Category tags drive expense tagging and filtering/reporting.
- Creating or editing a custom category also sets which budget-review bucket it counts as (Needs, Wants or Savings; Wants by default), and each custom category's row shows it (§8).

---

## 10. Authentication & Cloud Sync

Cloud sync is **optional** — the app is fully usable offline and local without an account.

### 10.1 Authentication

- **Email + password** sign-in and sign-up, surfaced through the auth guard and the Settings "Cloud Sync" section.
- **Sign out.**
- Session persistence with automatic token refresh.

### 10.2 Sync Behavior

- When signed in, local data syncs with the cloud, bidirectionally.
- **Conflict-free multi-device convergence:** budgets, people, and expenses merge per-entity; deletes propagate correctly and are never resurrected by an older copy from another device.
- Active-budget selection is reconciled after merge.
- **Sync status** is reflected in the UI.

---

## 11. Security — Budget Lock

Per-budget lock backed by device authentication.

- **Enable / disable lock** per budget.
- **Device authentication** via biometrics (Face ID / Touch ID / Android Biometric) or device passcode; the user is prompted to enrol one if none exists.
- **Auto-lock timer** — configurable (e.g. immediate, 5 minutes, 15 minutes).
- **Re-lock on foreground** — lock status is re-checked when the app returns to the foreground.
- **Lock gate** — a locked budget presents an unlock screen before its data is shown.

---

## 12. Data Management: Excel Export & Import

Budgets move in and out of the app as Excel workbooks (`.xlsx`), so a budget can be kept as a copy, shared with someone who doesn't use the app, or edited in a spreadsheet and brought back.

- **Export to Excel** — in a budget's ⋯ menu on the Budgets screen. The workbook has:
  - **Summary** — income, expenses and left to spend (per month and per year), household costs and split method, a per-person table (income, household share, personal expenses, left to spend) and a spending-by-category table. These are live formulas, so they recalculate as the sheets are edited; each also carries its calculated value for previews that don't calculate.
  - **People**, **Income**, **Expenses** — one row per person, income source and expense, with drop-downs (frequency, type, person, category), frozen header rows, filters and a *Per month* formula column. Expenses past their end date turn grey and are left out of the Summary. Blank rows below the data are ready for new entries.
  - **Lists** — the values the drop-downs offer.
- **Import from Excel** — on the Budgets screen. It reads the People, Income and Expenses sheets (columns are found by their header text, so reordering or adding columns is fine) and shows a preview — counts, new categories and any rows that were left out, each with its row number and reason — before anything is added. The budget name can be edited. Import always **adds a new budget** and never changes an existing one; people and expenses get fresh ids, so nothing collides with synced data. Rows with problems are skipped and the rest import.
- A budget under **Budget Lock** can't be exported from the list until it's the active, unlocked budget.
- On phones the export opens the share sheet (Save to Files, AirDrop, Mail); on desktop browsers it downloads.
- **Clear all data** ("Erase all data" in Settings → Danger zone) wipes the account's budgets and returns to the first-run welcome state.

## 13. Preferences & Personalization (Settings)

- **Currency selection** — searchable picker across 120+ currencies; drives all currency formatting (symbol + code).
- **Theme** — Light / Dark / System, persisted.
- **About** — app information.
- Settings uses a responsive split (master/detail on wide screens) with sections: Budgets, Cloud Sync, Categories, Currency, Theme, Financial Tools, About, Danger Zone.

---

## 14. Cross-Cutting UX

- **Responsive layouts** across phone / tablet / desktop.
- **Light / dark / system theming** on a token-based design system.
- **Toasts** for success/error feedback.
- **Confirmation dialogs** for destructive actions.
- **Haptic feedback** on mobile.
- **Reduced-motion** support.
- **Reusable UI primitives:** Card, ListRow, StatCard, Chip, Avatar, AmountText, EmptyState, SegmentedControl, Input, Skeleton, Button, Modal.
- **Installable PWA** with offline support.

---

## 15. Technical Architecture

### 15.1 Guiding principle: one codebase, web-first

Budget Flow is a forms-, lists-, and charts-driven finance app — not graphics- or hardware-intensive. It is therefore built as a **web-first, single-codebase** product: a first-class PWA that is also wrapped as native iOS/Android apps, rather than as separate native applications.

- Build the product with **Next.js (App Router) + React + TypeScript**, deployed on **Vercel** as an installable PWA.
- Ship to the iOS/Android App Stores by wrapping the same build in **Capacitor**, which exposes native APIs (biometrics, secure storage, filesystem, haptics, share sheet) through a thin, standards-based bridge.

### 15.2 Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Language** | TypeScript (strict) | Type safety end to end |
| **App framework** | Next.js (App Router, React Server Components) | Modern React standard, Vercel-native, strong PWA support |
| **Native packaging** | Capacitor | Web-to-native bridge for iOS/Android + native device APIs |
| **UI / components** | Tailwind CSS + shadcn/ui (Radix primitives) | Accessible primitives + tokens; maps cleanly to the Calm Ledger design system |
| **Design tokens** | CSS variables / Tailwind theme | Light/dark/system theming enforced structurally |
| **Client state** | Zustand | Lightweight global state |
| **Server/data state** | TanStack Query | Caching, background sync, optimistic CRUD |
| **Forms + validation** | React Hook Form + Zod | Typed, schema-first validation shared client/server |
| **Backend / DB / auth** | Supabase (Postgres + Auth + Row Level Security) | Managed Postgres, email/password auth, per-user data isolation |
| **Data sync** | Local-first store (IndexedDB) with server-authoritative / CRDT-based convergence | Conflict-free multi-device sync, offline-first |
| **Charts** | Recharts / Visx | Web-native charting for breakdowns |
| **Secure storage** | Keychain (iOS) / Keystore (Android) via Capacitor | Tokens and lock state |
| **Biometric lock** | Capacitor Biometric plugin | Face ID / Touch ID / Android Biometric |
| **Offline** | Service worker (Workbox) + IndexedDB | True offline-first PWA |
| **Testing** | Vitest (unit) + Playwright (e2e) | Strong coverage of domain logic and flows |
| **CI/CD** | GitHub Actions + Vercel previews; Fastlane / Xcode Cloud for native builds | Per-PR web previews; automated store builds |
| **Monorepo (optional)** | Turborepo | If shared packages grow beyond the app |
| **Hosting** | Vercel | Web + preview deployments |

### 15.3 Architectural standards

1. **Framework-agnostic `core/` package.** All domain logic — income/expense frequency normalization, household even/income-based distribution, the credit-card payoff engine, and expiring-expense derivation — lives as pure, well-tested functions independent of UI or framework.
2. **Schema-first types.** `Budget` / `Person` / `Expense` are defined as Zod schemas; TypeScript types and runtime validation are both derived from them. No untyped casts across boundaries.
3. **Money as integer minor units.** Amounts stored in minor units (cents) to eliminate floating-point drift in calculations and the payoff schedule.
4. **Conflict-free sync.** Multi-device convergence is handled by a server-authoritative merge (or CRDT-based sync engine) with an explicit conflict policy and delete propagation — not ad-hoc client logic.
5. **Row Level Security.** Each user's budgets isolated at the database level.
6. **Tokens over inline styles.** All theming and spacing flows through Tailwind + design tokens; no per-component style objects.
7. **Offline-first.** Reads and writes succeed offline against the local store; sync reconciles on reconnect.

### 15.4 Data model (v2)

```
AppData
 └─ budgets: Budget[]
 └─ activeBudgetId

Budget
 ├─ id, name, createdAt, modifiedAt
 ├─ people: Person[]
 ├─ expenses: Expense[]
 ├─ householdSettings: { distributionMethod: 'even' | 'income-based' }
 ├─ lock?: { enabled, autoLockMinutes, lastUnlockAt }
 └─ deletions: Record<id, timestamp>   // for sync convergence

Person
 ├─ id, name, updatedAt
 └─ income: Income[]                    // { id, amount, label, frequency }

Expense
 ├─ id, amount (minor units), description, updatedAt
 ├─ type: 'household' | 'personal'
 ├─ personId?                           // required when personal
 ├─ frequency: 'daily'|'weekly'|'monthly'|'yearly'|'one-time'
 ├─ categoryTag                         // default 'Misc'
 ├─ startDate, endDate?
 ├─ debtRepayment?: 'loan'|'mortgage'|'credit_card'
 └─ notes?
```

---

## 16. Non-Goals (v2)

- Bank/account aggregation or automatic transaction import.
- Investment portfolio tracking.
- Multi-user real-time collaboration within a single budget (sync is per-user across that user's own devices).
- Receipt/barcode scanning.
