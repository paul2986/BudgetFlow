# Budget Flow — Product Requirements Document (v2)

## 1. Overview

**Budget Flow** is a cloud-native personal and household budgeting application. It lets an individual or a household track income, expenses, and budgets; understand who owes what on shared costs; and plan debt repayment — with a local-first experience that stays fast offline and syncs across devices when signed in.

- **Platforms:** Web (primary, installable PWA), iOS, and Android from a single codebase.
- **Architecture:** Web-first. One TypeScript/React codebase deployed to the web and wrapped as native iOS/Android apps.
- **Data model:** Multi-budget. Each budget owns its own people, expenses and household settings; its lock belongs to the account (§11).
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
- **First-run flow** — when no budget exists, the user is guided to name and create their first budget before reaching the dashboard. The welcome screen says what's coming (name the budget, then add the people who share costs and the expenses), and shows the currency (picked from the device, §13) with a way to change it before the first amount is typed. Until a budget exists, People and Expenses, and their add forms, show "Create your budget first" with a button to Overview rather than an Add button that could only fail. Overview then shows a two-step setup checklist (people and income, then expenses); each step opens its form directly, and saving the first person returns to the checklist with the step ticked.

Each budget stores: `name`, `people[]`, `expenses[]`, `householdSettings`, `createdAt`, `modifiedAt`, and deletion metadata used for sync. The device's copy also carries a `lock` (see §11), which is never uploaded with the budget.

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
- **Counts as** — Needs, Wants or Savings: where this one expense counts in the Budget review. It shows where the chosen category counts and follows it until another bucket is picked (see Budget Review, "Counting one expense differently"). It can also be filtered on and bulk edited from the Expenses screen (§5.2).
- **Notes** — optional.

### 5.2 Expense List & Filtering

- Expense cards for the active budget.
- **Filter panel** supporting: type (all / household / personal), category (single and multiple), person, free-text search, has-end-date, debt-repayment and **Counts as** (Needs / Wants / Savings) filters. Category options are derived dynamically from the current expenses. Counts as filters by where an expense counts in the Budget review (its own choice, else its category's, with the budget's category choices applied), so "Loans" plus "Needs" finds the loans still counted as needs. An applied Counts as filter shows as a removable chip ("Counts as Wants"), persists like the other filters, and is cleared by Clear all.

**Bulk edit** (select expenses, then Edit) changes frequency, who pays, category, **Counts as** and end date for the whole selection in one save, with an Undo toast. Counts as offers No change, Same as category, Needs, Wants and Savings, and follows the form's rule: a bucket is stored only when it differs from where the expense's category counts, so choosing a bucket the category already has clears any override, and Same as category clears it for every selected expense whatever its category.

### 5.3 Active vs. Expiring Expenses

- The app derives whether a recurring expense is currently **active** from its start date and optional end date.
- An **expiring / ended section** surfaces recurring expenses ending soon (within ~30 days) or already ended, so users can review or renew them.

---

## 6. Overview Dashboard

A summary dashboard for the active budget, shown once it has at least one person and one expense.

- **"Left to spend"** headline with a **Daily / Monthly / Yearly** view-mode toggle.
- **Overview section** — income vs. expenses vs. remaining.
- **Debt help prompt** — for UK users (currency is pounds), a quiet card under the Overview section offering free debt advice when the budget looks stretched (see Debt Help, §8). Not shown otherwise.
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
- **Counting one expense differently:** every expense can count in a bucket other than its category's, set with **Counts as** on the expense form (a loan that paid for a want counts as a want; a credit card payment that was groceries counts as a need). It is stored on the expense (`Expense.bucket`, absent when the expense follows its category), so it syncs with the expense under the same last-write-wins rule. It beats the budget's choice for the category, and picking the bucket the category already counts in clears it. In the bucket card an overridden expense is listed under its own bucket on its own row ("moved from Needs, this expense only"), apart from the category rows, which count only the expenses that follow their category; tapping the row opens the expense. It changes the review only: the debt card, the expense filters and the Debt help prompt still see a loan as a loan, wherever it counts. Excel export writes a **Counts as** column (blank follows the category) and import reads it. An override set on an app build older than this feature is lost the next time that build saves the budget.
- **Edge cases:** a locked budget shows an unlock prompt and computes nothing; no income, no expenses and no budget each have an empty state with a way forward; spending beyond income shows a warning, and the bars share a scale so the budget's bar runs past the target's.
- **Links:** with money left over, the banner offers an amount to put into Savings and "See what $X/mo could grow into" opens the savings calculator with that amount already in the regular deposit (monthly; the interest rate is left for the user). The amount is the unallocated money, capped at what Savings is short of its 20% target (Savings already holds counts, so it is the gap, not the full 20%), rounded down to whole units. Once Savings meets the target it is all the unallocated money, because Savings is a floor. "Copy results" copies a plain-text summary.
- Maths lives in `utils/budgetReview.ts` and is unit-tested; the bars and cards are plain views (no new native dependency).

### Debt Help (UK)

Signposts people in the UK to free, impartial debt advice. It is a list of services, not a calculator, and it does not advise. It can also be offered quietly from the Overview and Budget review when a budget looks stretched (below).

- **Shown to UK users only:** the app has no country setting, so the Tools card appears when the currency is pounds (GBP, the default). The screen itself works at `/tools/debt-help` whatever the currency.
- **Where do you live?** England, Wales, Scotland or Northern Ireland (pills; the choice isn't saved). The list shows only the services that cover that nation, because the rules and some services differ: National Debtline doesn't cover Northern Ireland, and Citizens Advice has a separate line for England, Wales and Scotland while Advice NI covers Northern Ireland.
- **Services:** StepChange and National Debtline (charities), Citizens Advice (England, Wales or Scotland) or Advice NI, and MoneyHelper's debt advice locator (government-backed). Each card names who runs it (Charity or Government-backed), where it helps, what it does, a free phone number in the button text (so it can be read and dialled by hand where a tap can't call) and a link to its site. Opening hours are deliberately not shown; they change, so the card points to the website.
- **Around the list:** what to expect when talking to an adviser, a "Before you pay anyone" warning about fee-charging firms with a link to the FCA register, and a note that Budget Flow isn't a debt adviser, earns nothing from the links and sends nothing from a budget to these services. The note carries the date the details were last checked.
- **Data:** the services are hand-checked constants in `utils/debtHelp.ts` (`CHECKED_ON` says when). A unit test keeps the links `https`, the numbers free (0800/0808) and unique, and each nation's list sensible. Links and calls go through `utils/openLink.ts`, which allows only `https:` and `tel:`.
- **A quiet prompt where it matters:** on the Overview (under the Overview section) and in Budget review (under "How you compare"), a card titled "Money feeling tight?" offers "See free debt help" (opens this screen) and "Not now". It appears only for UK users (currency is pounds) and only when the monthly review shows a sign, judged on the rounded percentage the message quotes: spending at least **5%** above income (message: "about N% more than your income"), or loan and credit card payments at least **30%** of income (message: "take about N% of your income"). Mortgage payments are left out because they are secured and usually a housing cost; overspending takes priority when both apply. A slightly-over month does not raise it. The thresholds are prompts to look at help, not a diagnosis, and live in `utils/debtHelpNudge.ts`.
- **"Not now"** hides the prompt everywhere for 30 days on that device, then it comes back if the signs persist. The time is a per-device preference (`debt_help_nudge_dismissed_at`), not part of any budget, so it isn't synced or exported. A dismissal dated in the future (the clock moved) is ignored. The prompt is calm: a neutral icon, plain words, no warning colour.
- **Not done:** no affiliate or referral links, no tracking, and nothing is read from the budget on the Debt help screen. Nothing leaves the device when the prompt is shown or dismissed. There is no permanent "never show this" switch yet.

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
- **Welcome toast** — a password sign-in shows "Welcome back!", except for an account confirmed in the last 24 hours (`utils/newAccount.ts`): that is a first sign-in, say after confirming the email in another browser, and the screen it lands on (the welcome screen or the invitation) already greets them. Confirmation time is used because the server's last-sign-in time is already set by the confirmation itself.
- **Invite links for people without an account** — someone who opens a budget invite link while signed out sees a notice that they've been invited, lands on **Create account** (Sign in is one tap away), and after signing up (and confirming their email) is taken straight to the invitation. The invite is remembered in the browser and also stored on the new account (`pending_invite` in its metadata), so a confirmation email opened in another browser or app (an iPhone's Safari rather than the installed home-screen app) still finds it. Someone who already has an account and taps Create account anyway is moved to Sign in with their email kept and told they already have an account (the server's `user_already_exists` answer, or a sign-up that returns a user with no identities, which some server configurations use to hide which emails exist), rather than shown a raw error or a "Check your email" screen for mail that never comes. Signing in on the invite page goes straight to the invitation, which says which account will join ("Joining as …") and offers "Not you? Use a different account": that signs out, keeps the invite, and the sign-in screen shows the invite notice again. It is cleared once the invitation screen opens, so "Not now" doesn't bring it back. The notice doesn't name the budget: the invite preview needs a signed-in user by design. Native apps have no link to remember; invite links open the web app.

### 10.2 Sync Behavior

- When signed in, local data syncs with the cloud, bidirectionally.
- **Conflict-free multi-device convergence:** budgets, people, and expenses merge per-entity; deletes propagate correctly and are never resurrected by an older copy from another device.
- Active-budget selection is reconciled after merge.
- **Sync status** is reflected in the UI.

---

## 11. Security — Budget Lock

A 4-digit code that hides a budget until it is entered. It is a screen lock for whoever picks up the device, not encryption: budgets are stored unencrypted, and four digits can be guessed by anyone who holds the stored hash.

- **Turning it on** — Budgets → ⋯ → Budget lock → switch on. It asks for a code twice (a mismatch starts again). Off asks for the code.
- **Follows the account** — the lock is the signed-in account's own, per budget, kept in `budget_locks` (`supabase/migrations/20261006120000_budget_locks.sql`) and read on every sync. A budget locked on the iPhone is locked on the web app and an installed web app too; each device is unlocked separately. The people a budget is shared with are never asked for the code, can't see it, and can set their own. Turning a lock on, off or changing it needs a connection, because it is saved to the account first; leaving or being removed from a budget takes your lock with it. A lock the server couldn't be asked for during a sync is left alone, never read as "no lock".
- **The code** — stored only as a salted PBKDF2-SHA-256 hash (`v1$<iterations>$<salt>$<hash>`, `utils/budgetLock.ts`), checked on the device, so a locked budget opens offline. Wrong codes: four free, then waits of 30 s, 1 min, 5 min, 15 min and 1 hour, kept on the device so quitting the app doesn't skip them.
- **Face ID / Touch ID** — iPhone and Android only, optional, per budget per device (never synced): offered right after a lock is set and in the lock screen's settings, with the code always available. The device does the recognising; Face ID is asked for as soon as the lock appears.
- **Auto-lock** (synced): *Immediately* (as soon as the app is left, or the tab hidden), 1, 5, 15 minutes, 1 hour, or *Never*. Which budgets are unlocked is held in memory, so quitting the app or reloading the page locks again; *Never* alone is remembered on the device. The clock starts when the app goes to the background, not while the Face ID prompt or the notification shade is up.
- **Changing the code** asks for the current one first. Changing it elsewhere locks every other device again.
- **Forgot the code** — "Forgot code?" on the lock screen takes the account password (checked without touching the signed-in session) and turns the lock off on every device; a new code can be set straight after.
- **Lock gate** — a locked budget shows the code pad instead of Overview, Expenses, People and Budget review; the lock settings of a locked budget ask for the code before they open. Add/edit forms already open aren't covered.

---

## 12. Data Management: Excel Export & Import

Budgets move in and out of the app as Excel workbooks (`.xlsx`), so a budget can be kept as a copy, shared with someone who doesn't use the app, or edited in a spreadsheet and brought back.

- **Export to Excel** — in a budget's ⋯ menu on the Budgets screen. The workbook has:
  - **Summary** — income, expenses and left to spend (per month and per year), household costs and split method, a per-person table (income, household share, personal expenses, left to spend) and a spending-by-category table. These are live formulas, so they recalculate as the sheets are edited; each also carries its calculated value for previews that don't calculate.
  - **People**, **Income**, **Expenses** — one row per person, income source and expense, with drop-downs (frequency, type, person, category, and *Counts as* for the Budget review — blank follows the category), frozen header rows, filters and a *Per month* formula column. Expenses past their end date turn grey and are left out of the Summary. Blank rows below the data are ready for new entries.
  - **Lists** — the values the drop-downs offer.
- **Import a workbook** — on the Budgets screen. It only reads Budget Flow's own layout, not any spreadsheet, so the screen opens on how it works: get a workbook (a **blank template** from that screen, or an export), fill it in, choose it. A file that doesn't fit says so and offers the template again. It reads the People, Income and Expenses sheets (columns are found by their header text, so reordering or adding columns is fine) and shows a preview — counts, new categories and any rows that were left out, each with its row number and reason — before anything is added. The budget name can be edited. Import always **adds a new budget** and never changes an existing one; people and expenses get fresh ids, so nothing collides with synced data. Rows with problems are skipped and the rest import.
- A budget under **Budget Lock** can't be exported (or duplicated) from the list until it has been unlocked on this device.
- On phones the export opens the share sheet (Save to Files, AirDrop, Mail); on desktop browsers it downloads.
- **Clear all data** ("Erase all data" in Settings → Danger zone) wipes the account's budgets and returns to the first-run welcome state.

## 13. Preferences & Personalization (Settings)

- **Currency selection** — searchable picker across 120+ currencies; drives all currency formatting (symbol + code). A device with no saved choice starts with its locale's currency, from the region of its language settings (en-US → dollars, de-DE → euros, en-GB → pounds; pounds when the locale names no currency the app offers) and saves it. It is chosen at launch, before any budget syncs down: a device that already holds budgets keeps pounds, the default every earlier version showed, so its numbers don't change meaning. The choice is per device and can be changed on the welcome screen or in Settings. The Debt help card follows the currency (pounds), so it appears for UK locales only.
- **Privacy** — a plain-language page (`utils/privacyText.ts`, shown by `components/PrivacyContent`) saying what is stored (account email and a hashed password, budgets, feedback), what stays on the device, who can see a budget (members; the person who runs the app can technically reach the database but the admin screen shows totals only), who else is involved (Supabase; Vercel hosting and cookieless page-view counts on the web version only), and how to export, erase or delete. It is a sheet on the sign-in screen ("How your data is used", readable before an account exists) and Settings → Privacy. A unit test (`tests/unit/privacyText.test.ts`) checks the claims a machine can: the 7-day invite expiry, no analytics SDK but Vercel's, account deletion. It is plain-language disclosure, not a legal policy or terms of service, and has no public URL (the app sits behind sign-in).
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
