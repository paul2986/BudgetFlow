# BudgetFlow Apple HIG Design System Setup

**Completed:** 2026-09-27

This document summarizes the Apple Human Interface Guidelines (HIG) implementation for BudgetFlow, including:
1. ✅ CLAUDE.md configuration file created
2. ✅ UI audit completed and documented
3. ✅ Design skills installed

---

## 1. CLAUDE.md Configuration

**File:** [CLAUDE.md](./CLAUDE.md)

A comprehensive design rulebook has been created for Claude Code to enforce Apple HIG compliance across all future development. This file:

- Defines **strict 8pt grid system** for spacing
- Establishes **consistent typography scale** (display, h1, h2, h3, body, caption)
- Enforces **semantic color tokens** (no hardcoded hex values)
- Sets **micro-interaction guidelines** (spring physics, haptic feedback)
- Prevents **over-designed custom components** (follow platform conventions)
- Includes an **implementation checklist** for each new feature

**How to use:**
- Claude Code loads `CLAUDE.md` automatically in every session for this project
- Reference it when building new screens or components
- When asking Claude to build UI, mention "follow CLAUDE.md guidelines"

---

## 2. UI Audit Results

**File:** [UI_AUDIT.md](./UI_AUDIT.md)

A detailed audit was performed on the existing codebase against Apple HIG standards.

### Compliance Score: **85/100** ✅ Strong Foundation

**What's Working Well:**
- ✅ Spacing & Grid (95/100) — 4pt scale consistently applied
- ✅ Typography (95/100) — Proper scale with correct weights
- ✅ Colors & Tokens (90/100) — Semantic tokens, light/dark mode support
- ✅ Elevation/Shadows (100/100) — Subtle, Apple-like shadows
- ⚠️ Micro-interactions (80/100) — Missing haptic feedback
- ⚠️ Components (75/100) — New primitives solid; legacy code needs audit
- ⚠️ Responsive (80/100) — Defined but needs device testing
- ⚠️ Dark Mode (75/100) — Defined but needs visual verification
- ⚠️ Accessibility (70/100) — Needs formal audit

### High-Priority Action Items:
1. **Audit legacy screens** — settings.tsx, budgets.tsx, expenses.tsx may contain hardcoded colors/spacing
2. **Add haptic feedback** — Button presses, delete actions, toast notifications
3. **Verify button press timing** — Should fire on `onPressIn` (not `onPressOut`)
4. **Test on devices** — iPhone with notch, iPad, light/dark mode rendering

See [UI_AUDIT.md](./UI_AUDIT.md) for full details and checklist.

---

## 3. Design Skills Installed

Two industry-standard Apple design skills have been installed:

### a) **swiftui-pro** (Paul Hudson)
- Source: [twostraws/swiftui-agent-skill](https://github.com/twostraws/swiftui-agent-skill)
- Purpose: SwiftUI best practices, modern APIs, performance, maintainability
- When to use: When reviewing or building gesture-driven UI, animations, component architecture
- **Location:** `.agents/skills/swiftui-pro/`

### b) **apple-design** (Emil Kowalski)
- Source: [emilkowalski/skills/apple-design](https://github.com/emilkowalski/skills)
- Purpose: Apple interface design, spring animations, drag/swipe/sheet interactions, typography, reduced-motion support
- When to use: When building or reviewing gesture-driven UI, animations, design foundations
- **Location:** `.agents/skills/apple-design/`

**How to activate these skills:**
```bash
# Check installed skills
ls .agents/skills/

# Or in Claude Code, ask:
# "Use the apple-design skill to review this component"
# "Use the swiftui-pro skill to audit animation timings"
```

---

## Design Token Foundation

BudgetFlow already has an excellent design token system in place (`styles/tokens.ts`):

### Spacing
```ts
space: {
  s1: 4,   // smallest unit
  s2: 8,   // standard margin/padding
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s7: 32,  // section spacing
  s8: 40,
  s9: 48,
  s10: 64
}
```

### Corner Radius
```ts
radius: {
  sm: 8,       // chips, inputs
  md: 12,      // buttons, list rows
  lg: 16,      // cards
  xl: 24,      // sheets, hero
  full: 999    // avatars
}
```

### Typography Scale
- **display:** 34pt, 700 weight (headings)
- **h1:** 28pt, 700 weight
- **h2:** 22pt, 600 weight (section titles)
- **h3:** 17pt, 600 weight
- **body:** 16pt, 400 weight
- **caption:** 13pt, 500 weight
- **overline:** 12pt, 600 weight (uppercase)

### Semantic Colors
- `brand` / `onBrand` — primary interactive elements
- `surface` / `surfaceRaised` / `surfaceSunken` — backgrounds
- `text` / `textMuted` / `textFaint` — text hierarchy
- `income` / `expense` / `warning` / `danger` — semantic meanings
- Light & dark mode variants for all

### Motion
- `fast: 150ms` — hover/press states
- `base: 220ms` — transitions
- `spring: { damping: 28, stiffness: 260 }` — Apple-like spring physics

---

## Next Steps

### Phase 1: Quick Wins (This Week)
- [ ] Add haptic feedback to buttons and key interactions
- [ ] Verify button press timing (onPressIn vs onPressOut)
- [ ] Test app on physical iPhone and iPad
- [ ] Dark mode visual verification

### Phase 2: Legacy Code Audit (Next Week)
- [ ] Audit settings.tsx for hardcoded colors/spacing
- [ ] Audit budgets.tsx, expenses.tsx, people.tsx
- [ ] Migrate all colors to semantic tokens
- [ ] Replace hardcoded spacing with space.* constants

### Phase 3: Polish & Accessibility (Following Week)
- [ ] WCAG AA contrast audit (especially dark mode)
- [ ] Touch target size verification (44pt minimum)
- [ ] Semantic HTML/a11y labels
- [ ] Reduced motion support testing

### Phase 4: Documentation (Ongoing)
- [ ] Update PRD.md with design system documentation
- [ ] Document component variants and usage
- [ ] Create Storybook (optional but recommended)
- [ ] Add screenshot examples of light/dark modes

---

## Accessing Design Skills in Claude Code

When working on UI/UX:

1. **For gesture-driven UI or animations:**
   ```
   "@apple-design review this spring animation config"
   or
   "@swiftui-pro check my component structure"
   ```

2. **For design consistency checks:**
   ```
   "@apple-design audit this component against HIG spacing rules"
   ```

3. **For performance optimization:**
   ```
   "@swiftui-pro optimize this component for rerender performance"
   ```

---

## File Summary

| File | Purpose | Status |
|------|---------|--------|
| [CLAUDE.md](./CLAUDE.md) | Design rulebook for Claude Code | ✅ Created |
| [UI_AUDIT.md](./UI_AUDIT.md) | Detailed compliance audit | ✅ Created |
| [styles/tokens.ts](./styles/tokens.ts) | Design tokens foundation | ✅ Excellent |
| [components/ui/](./components/ui/) | Calm Ledger primitives | ✅ Good (needs audit) |
| `.agents/skills/swiftui-pro/` | SwiftUI design skill | ✅ Installed |
| `.agents/skills/apple-design/` | Apple design principles skill | ✅ Installed |

---

## Questions & Support

- **Q: Will these changes affect the current app?**  
  A: No. CLAUDE.md and the skills guide future development. The app remains unchanged until features are modified.

- **Q: Do I need to use the skills manually?**  
  A: They're available to Claude Code automatically. You can explicitly request them when needed (e.g., "use the apple-design skill to..."), or I'll suggest them when appropriate.

- **Q: Can these skills work with React Native?**  
  A: Yes, with adaptation. The principles (spacing, typography, motion physics) translate directly. SwiftUI-specific syntax will be adapted to React Native equivalents.

- **Q: How do I update CLAUDE.md?**  
  A: Edit it anytime. It's a living document that should evolve with your design system. Key sections: spacing rules, typography scale, color tokens, component patterns.

---

**Setup completed by:** Claude Code  
**Setup date:** 2026-09-27  
**Ready for:** Design audit, component development, accessibility testing
