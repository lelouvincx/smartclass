# RFC: Migrate to shadcn/ui + Tailwind v4 + Dark Mode

**Date:** 2026-03-16
**Status:** In Progress (Phase 1)
**Author:** lelouvincx + Claude Code

---

## Motivation

The current frontend uses plain Tailwind CSS v3 with inline utility classes and zero reusable UI
components. This leads to:

- **388 `className=` usages** across 9 page components with heavily duplicated styling patterns
- **No shared primitives** — buttons, inputs, cards, badges, tables are all inlined
- **No dark mode** support
- **No design system** — visual consistency depends on copy-pasting class strings

Adopting shadcn/ui provides a component library built on Radix UI primitives with Tailwind styling,
giving us accessible, themeable, and composable UI components out of the box.

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | **Stay JavaScript** (`tsx: false`) | Narrower scope; log TS migration as separate tech debt |
| Tailwind version | **Upgrade to v4** | shadcn/ui v2 is optimized for v4; future-proofs the setup |
| Dark mode | **Yes, class-based** | shadcn/ui CSS variables make this trivial; ship with light/dark/system |
| Migration approach | **Incremental** | Phase 1 = infrastructure; Phase 2 = core components; Phase 3+ = page-by-page |
| shadcn/ui style | **new-york** | Cleaner, more compact variant |
| Base color | **slate** | Matches existing palette (83% of current color usages are `slate-*`) |
| Icon library | **lucide-react** | Already installed (`^0.468.0`) |

---

## Current State (Before)

- **Tailwind**: v3.4.17 via PostCSS (`postcss.config.js` + `tailwind.config.js`)
- **CSS**: `@tailwind base/components/utilities` directives in `src/index.css`
- **Components**: 0 reusable primitives; 9 page components in `src/pages/`
- **Dark mode**: None
- **Path aliases**: None
- **Theming**: None (hardcoded `slate-*` classes)

---

## Phase 1: Infrastructure Setup

**Goal**: shadcn/ui + Tailwind v4 + dark mode working, zero visual changes to existing pages.

### 1.1 Upgrade Tailwind v3 to v4

- Run `npx @tailwindcss/upgrade` to auto-rename utility classes across all files
- Key renames: `rounded` -> `rounded-sm`, `shadow-sm` -> `shadow-xs`, `outline-none` -> `outline-hidden`, `ring` -> `ring-3`
- Replace `@tailwind` directives with `@import "tailwindcss"` in `src/index.css`
- Remove `postcss.config.js` and `tailwind.config.js`
- Remove `autoprefixer` and `postcss` from `devDependencies`
- Add `@tailwindcss/vite` plugin to `vite.config.js`

### 1.2 Initialize shadcn/ui

- Run `npx shadcn@latest init` with config:
  ```json
  {
    "style": "new-york",
    "rsc": false,
    "tsx": false,
    "tailwind": { "config": "", "css": "src/index.css", "baseColor": "slate", "cssVariables": true },
    "iconLibrary": "lucide",
    "aliases": {
      "components": "@/components",
      "utils": "@/lib/utils",
      "ui": "@/components/ui",
      "lib": "@/lib",
      "hooks": "@/hooks"
    }
  }
  ```
- Creates `components.json`, updates `src/index.css` with CSS variable theme

### 1.3 Path Aliases

- Add `resolve.alias: { '@': path.resolve(__dirname, './src') }` to `vite.config.js`
- Create `jsconfig.json` with `paths: { "@/*": ["./src/*"] }`

### 1.4 Dark Mode

- Add `@custom-variant dark (&:where(.dark, .dark *))` to CSS
- Create `src/components/theme-provider.jsx` from shadcn docs
- Wrap `<App />` with `<ThemeProvider>` in `src/main.jsx`

### 1.5 Utilities

- Install `clsx` + `tailwind-merge`
- Create `src/lib/utils.js` exporting `cn()` function

### 1.6 Verification

- `npx vitest run src/` — frontend tests pass
- `npx vitest run --config vitest.worker.config.js` — backend tests pass
- Manual: existing pages look identical

---

## Phase 2: Core shadcn/ui Components (future PR)

Add the most-used components via CLI:

```bash
npx shadcn@latest add button card input label badge table select dialog switch
```

Create shared layouts:
- `src/components/student-layout.jsx` — resolves tech debt: "Extract StudentLayout component"
- `src/components/teacher-layout.jsx`
- `src/components/mode-toggle.jsx` — dark mode toggle in both layouts

---

## Phase 3+: Incremental Page Migration (future PRs, 1 per page)

Priority order (simplest to most complex):

| PR | Page | Effort | Key components |
|----|------|--------|----------------|
| 3a | `LoginPage` | Small | Button, Input, Label, Card |
| 3b | `RegisterPage` | Small | Button, Input, Label, Card |
| 3c | `StudentDashboardPage` | Small | Card, Button |
| 3d | `TeacherDashboardPage` | Small | Card, Button |
| 3e | `StudentExercisesPage` | Medium | Table, Badge, Button, Card |
| 3f | `TeacherExercisesPage` | Medium | Table, Badge, Button, Card, Dialog |
| 3g | `StudentTakeExercisePage` | Large | Card, Button, Input, Select, Switch, Dialog, Badge |
| 3h | `TeacherCreateExercisePage` | Large | Card, Button, Input, Select, Switch, Table, Dialog |
| 3i | `TeacherViewExercisePage` | Large | Card, Button, Input, Select, Switch, Table, Dialog, Badge |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Tailwind v4 class renames break styling | `npx @tailwindcss/upgrade` auto-fixes most; manual audit |
| `border` default color change (`currentColor`) | Add explicit `border-slate-200` where bare `border` used |
| `ring` width change (3px to 1px) | Replace `ring` with `ring-3` in focus styles |
| shadcn/ui components don't match current design | Fine-tune CSS variables to match `slate` palette |
| Frontend tests break from className changes | Update test selectors if needed; mostly test behavior not classes |

---

## Code Style Updates

After migration, the project code style (in `AGENTS.md`) should be updated:

- **Styling**: shadcn/ui components + Tailwind utility classes via `cn()` from `@/lib/utils`
- **Component imports**: Use `@/` path alias (e.g., `import { Button } from '@/components/ui/button'`)
- **New components**: Use shadcn/ui CLI (`npx shadcn@latest add <component>`) when available
- **Dark mode**: All new UI must support dark mode via CSS variables (no hardcoded colors)

---

## Future Tech Debt Created

- [ ] **Migrate from JavaScript to TypeScript** — Add `tsconfig.json`, rename `.jsx` to `.tsx`, add type annotations. Consider incremental adoption (strict mode off initially).
