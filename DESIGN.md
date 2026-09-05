---
version: alpha
name: SmartClass Learning System
description: A calm, accessible, Material-informed academic interface with bounded expressive emphasis.
colors:
  primary: "#2563EB"
  on-primary: "#FFFFFF"
  primary-container: "#DBEAFE"
  on-primary-container: "#1E3A8A"
  secondary: "#475569"
  on-secondary: "#FFFFFF"
  secondary-container: "#E2E8F0"
  on-secondary-container: "#1E293B"
  tertiary: "#0F766E"
  on-tertiary: "#FFFFFF"
  tertiary-container: "#CCFBF1"
  on-tertiary-container: "#134E4A"
  canvas: "#F8FAFC"
  surface: "#FFFFFF"
  surface-subtle: "#F8FAFC"
  surface-muted: "#F1F5F9"
  text: "#0F172A"
  text-secondary: "#475569"
  border: "#CBD5E1"
  focus: "{colors.primary}"
  selection: "{colors.primary-container}"
  danger: "#B91C1C"
  danger-muted: "#FEF2F2"
  success: "#15803D"
  success-muted: "#F0FDF4"
  warning: "#A16207"
  warning-muted: "#FEFCE8"
  chart-1: "#2563EB"
  chart-2: "#0D9488"
  chart-3: "#7C3AED"
  chart-4: "#D97706"
  chart-5: "#DB2777"
  dark-primary: "#93C5FD"
  dark-on-primary: "#172554"
  dark-primary-container: "#1E3A8A"
  dark-on-primary-container: "#DBEAFE"
  dark-canvas: "#0F172A"
  dark-surface: "#111827"
  dark-surface-muted: "#1E293B"
  dark-text: "#F8FAFC"
  dark-text-secondary: "#CBD5E1"
  dark-border: "#475569"
  dark-danger: "#F87171"
  dark-success: "#4ADE80"
  dark-warning: "#FACC15"
typography:
  display:
    fontFamily: Roboto, Noto Sans, sans-serif
    fontSize: 3rem
    fontWeight: 760
    lineHeight: 0.95
  headline:
    fontFamily: Roboto, Noto Sans, sans-serif
    fontSize: 1.75rem
    fontWeight: 720
    lineHeight: 1.12
  title:
    fontFamily: Roboto, Noto Sans, sans-serif
    fontSize: 1rem
    fontWeight: 600
    lineHeight: 1.5rem
  body:
    fontFamily: Roboto, Noto Sans, sans-serif
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.25rem
  label:
    fontFamily: Roboto, Noto Sans, sans-serif
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1rem
rounded:
  none: 0px
  xs: 4px
  sm: 8px
  md: 10px
  lg: 14px
  xl: 20px
  focal: 32px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  content-max: 64rem
  target-min: 48px
components:
  app-canvas:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text}"
  sidebar:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.text}"
  metadata:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text-secondary}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "{spacing.lg}"
  divider:
    backgroundColor: "{colors.border}"
    height: 1px
  focus-ring:
    backgroundColor: "{colors.focus}"
    size: 3px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.lg}"
    height: "{spacing.target-min}"
  navigation-active:
    backgroundColor: "{colors.selection}"
    textColor: "{colors.on-primary-container}"
    rounded: "{rounded.xl}"
    height: "{spacing.target-min}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    height: "{spacing.target-min}"
  status-success:
    backgroundColor: "{colors.success-muted}"
    textColor: "{colors.success}"
    rounded: "{rounded.full}"
  status-warning:
    backgroundColor: "{colors.warning-muted}"
    textColor: "{colors.warning}"
    rounded: "{rounded.full}"
  status-danger:
    backgroundColor: "{colors.danger-muted}"
    textColor: "{colors.danger}"
    rounded: "{rounded.full}"
  chart-series-1:
    backgroundColor: "{colors.chart-1}"
  chart-series-2:
    backgroundColor: "{colors.chart-2}"
  chart-series-3:
    backgroundColor: "{colors.chart-3}"
  chart-series-4:
    backgroundColor: "{colors.chart-4}"
  chart-series-5:
    backgroundColor: "{colors.chart-5}"
  dark-app-canvas:
    backgroundColor: "{colors.dark-canvas}"
    textColor: "{colors.dark-text}"
  dark-surface:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-text}"
  dark-surface-muted:
    backgroundColor: "{colors.dark-surface-muted}"
    textColor: "{colors.dark-text-secondary}"
  dark-button-primary:
    backgroundColor: "{colors.dark-primary}"
    textColor: "{colors.dark-on-primary}"
    rounded: "{rounded.lg}"
    height: "{spacing.target-min}"
  dark-navigation-active:
    backgroundColor: "{colors.dark-primary-container}"
    textColor: "{colors.dark-on-primary-container}"
    rounded: "{rounded.xl}"
    height: "{spacing.target-min}"
  dark-divider:
    backgroundColor: "{colors.dark-border}"
    height: 1px
  dark-status-success:
    textColor: "{colors.dark-success}"
  dark-status-warning:
    textColor: "{colors.dark-warning}"
  dark-status-danger:
    textColor: "{colors.dark-danger}"
---

## Overview

SmartClass is a focused learning workspace, not a marketing surface. Its atmosphere is calm, dependable, and academically neutral: cool slate foundations, one confident blue for action and selection, compact metadata, and quiet surfaces that keep attention on exercises and results.

The visual contract is **Material-informed, not strictly Material-compatible**. Material 3 Expressive supplies reference principles for hierarchy, motion, shape, and emphasis; it does not require a wholesale component replacement or exact conformance. Existing SmartClass React, Tailwind, and shadcn conventions remain the implementation foundation.

The approved reference boundary was last reviewed on **2026-08-30**. Dense assessment and administration flows use the calm baseline. Expressive emphasis is reserved for creation, starting an attempt, completion, score, progress, and empty states. Do not apply expressive shape, color, scale, or motion uniformly to tables, forms, question controls, review rows, or navigation.

This contract is grounded in SmartClass's shipped product behavior in [`PRODUCT.md`](PRODUCT.md), its implemented tokens in [`src/design-system/tokens.css`](src/design-system/tokens.css), and the approved Material 3 Expressive migration boundary in [`docs/plans/RFC-8-2026-08-30-material-3-expressive-migration.md`](docs/plans/RFC-8-2026-08-30-material-3-expressive-migration.md). It does not copy Google's product identity; it uses Google's DESIGN.md format to describe SmartClass's own interface.

The YAML front matter is the machine-readable contract. `src/design-system/tokens.css` is its implementation counterpart. Product-level compositions live in `src/design-system/`; low-level shadcn primitives remain in `src/components/ui/`.

Keep three layers. Components must consume semantic or component tokens, never reference tokens directly.

1. **Reference tokens** hold the raw palette, type scale, shape scale, spacing, elevation, and motion values inspired by Material 3 Expressive.
2. **Semantic tokens** map intent to a theme: canvas, surface, text, border, primary action, selection, status, focus, and emphasis.
3. **Component tokens** encode bounded decisions for app shell, buttons, cards, fields, tables, question navigation, score/progress, and empty states.

Light and dark themes may map semantic values differently but must preserve meaning, contrast, and emphasis hierarchy. Add or change tokens before introducing repeated one-off utility values.

## Colors

Use `canvas` for the page, `surface` for cards and overlays, and `surface-subtle` for persistent navigation. The slate text hierarchy is deliberate: `text` for decisions and headings, `text-secondary` for supporting prose, and `text-muted` only for metadata that can safely recede.

The unprefixed color tokens define the light theme. Tokens prefixed with `dark-` define the corresponding dark-theme values. Keep both mappings aligned with `tokens.css`; component references describe the light-theme role and retain the same semantic meaning when dark mode remaps it.

Blue means interaction, current location, or focus. Use `selection` with blue text for selected navigation and metadata wells; reserve solid `primary` for the primary action. Do not fill large decorative areas with blue.

Success, warning, and danger always combine color with text or an icon. Never use a green check alone to distinguish “complete”, “correct”, and “approved”. Use the chart palette in listed order, and add direct labels or patterns where categories could otherwise depend on color alone.

All body text and interactive labels must meet WCAG AA contrast. Focus rings use `primary` and remain visible in both themes.

## Typography

Use Roboto, the Material 3 default typeface, with Noto Sans and the system sans serif as fallbacks. Load Roboto with `font-display: swap` so text remains visible while the web font loads. Page titles are bold and compact; section titles are semibold; body text stays regular. Keep descriptions to readable line lengths rather than stretching them across the workspace.

SmartClass uses `html { font-size: 125% }` as a readable default without making dense learning workflows feel zoomed in. Relative type and spacing scale from that baseline; do not reset it inside components. Use tabular numerals for times and scores when alignment matters.

## Layout

Desktop and mobile are equal product targets. Every interface change must preserve the complete task flow, content hierarchy, and access to primary actions in both form factors; neither may be deferred as follow-up work. Start with fluid, shrinkable content and add desktop composition at breakpoints. Avoid fixed content widths, unbreakable action rows, and minimum-size grid tracks that can force document-level horizontal overflow.

Desktop uses a fixed, quiet sidebar that people can collapse to the compact labelled-icon rail. Remember that preference on the device and keep the centered content column no wider than 64rem. The active exercise-taking route is the intentional exception: temporarily use the compact rail and a wide workspace without changing the saved sidebar preference, bound the answer rail, and give remaining width to the question image. Main page composition follows a 24–32px vertical rhythm. Cards use 16–24px internal padding and responsive grids rather than fixed card widths.

At mobile widths and in short landscape viewports, replace the sidebar with a labelled menu button and a left drawer so navigation never consumes scarce reading width. The drawer must close through its close control, overlay dismissal, Escape, and route selection. Keep every interactive target at least 48 × 48 CSS pixels.

At these viewports, the document must not scroll horizontally. Dense tables and schemas may instead scroll horizontally within their own visibly bounded container, but primary actions and essential labels must remain discoverable without hover. Wide isolated-question images use a fit-width inline preview that opens a full-screen viewer: portrait starts at a readable scale with swipe, pinch, and button zoom, while landscape starts fit-to-width.

Prefer summary cards and dedicated detail routes over unbounded inline expansion. Long titles wrap or expose their full value; truncation requires a full-title affordance.

Dense tables, schemas, answer forms, and review surfaces prioritize scanability. Expression must not reduce visible rows, obscure comparison, or move primary assessment controls. Creation and milestone surfaces may use more generous spacing or a stronger focal shape when the surrounding flow stays calm.

## Elevation & Depth

Default cards use a 1px `border` plus the low card shadow defined in `tokens.css`. Use the raised shadow only for temporary overlays, drawers, and menus. Hierarchy should come primarily from spacing, typography, and surface contrast—not stacks of floating containers.

Avoid nested cards when a divider, heading, or grouped row communicates the same relationship. Sticky regions need an opaque or blurred surface and a separating border.

## Shapes

Use 20px corners for cards and selected navigation, and 14px corners for controls and icon wells. Reserve the 32px focal shape for approved expressive moments. Use pills only for short statuses, tags, and compact metadata. Do not make ordinary buttons or content containers fully rounded.

Icons use the Lucide outline family at 16–20px. They support labels rather than replace them unless the control has an explicit accessible name.

Use shape contrast deliberately. Standard controls retain the existing restrained radii. A larger focal shape is allowed only at an approved expressive moment; do not create a page-wide collection of unrelated rounded forms.

## Components

Motion explains state and hierarchy; it is not decoration. Keep dense flows short and unobtrusive. Creation, start, completion, score, progress, and empty-state transitions may use a bounded emphasized transition when it clarifies the milestone. Respect `prefers-reduced-motion`, preserve focus, and never delay input or grading feedback for animation.

- **App shell:** `AppShell` owns desktop navigation, the labelled mobile drawer, current-route state, account controls, and the responsive content boundary.
- **Page header:** `PageHeader` provides one semantic `h1`, a concise description, and optional right-aligned actions. Do not put a page title in a card solely to create visual weight.
- **Cards:** use a white surface, slate border, 20px radius, and low elevation. Entire-card links need a clear focus ring and directional cue.
- **Action cards:** use an icon well, action name, one-line outcome, and trailing arrow. Keep the whole card clickable.
- **Empty states:** `EmptyState` uses a semantic heading, explains what happened, and offers one recovery action when the user can proceed.
- **Buttons:** show one primary action per local group. Secondary actions are outline or quiet. Labels use verbs and controls remain large enough for touch.
- **Navigation:** current location uses blue text on `selection`, not a solid blue rail. Every item combines icon and text.
- **Tables and metadata:** use muted headers, restrained row separators, and explicit column labels. Scores and statuses include text, not color alone.
- **Disclosures:** summarize collapsed content and keep expanded learning rows grouped. Move complex or lengthy work to a dedicated page.
- **Expressive moments:** creation entry points, Start, completion, score, progress, and empty states may use one stronger focal treatment. Keep adjacent controls and data calm so the emphasis remains meaningful.

## Do's and Don'ts

- **Do** keep learning content, progress, and the next action visually dominant.
- **Do** use semantic headings, landmarks, current-route state, visible focus, and labelled icon controls.
- **Do** provide useful empty-state recovery and preserve full access to long titles.
- **Don't** copy third-party brand assets, course images, or proprietary copy into SmartClass.
- **Don't** use controls smaller than 48 × 48px or rely on hover-only actions.
- **Don't** let support widgets, floating controls, or sticky actions overlap learning content.
- **Don't** use ambiguous green checks or status color without a textual label.
- **Don't** create excessive inline expansion that pushes the next course or task far below the fold.
- **Don't** treat Material guidance as a requirement to replace shadcn/Radix primitives or imitate every Material component.
- **Don't** add expressive motion, oversized type, or high shape contrast to dense assessment and administration rows.

### Frontend acceptance

For every frontend change:

1. **Scope:** Treat a route as affected when it changes directly or renders a changed shared component. On each affected route, exercise the primary task and test the default state, every state added or changed, and each of these states when present in the changed component or layout: loading, empty, error or validation, longest realistic content, and open drawers, menus, dialogs, sticky controls, or floating controls.
2. **Baseline behavior:** Complete those checks at 390 × 844 mobile and 1280 × 800 desktop. A state does not need to be repeated in both themes unless its implementation is theme-specific.
3. **Theme coverage:** At each baseline viewport, visually inspect at least one affected state in both light and dark mode. This creates four required baseline combinations: mobile light, mobile dark, desktop light, and desktop dark. Inspect every theme-specific state in both themes.
4. **Compression checks:** For changes to layout, sizing, text, navigation, tables or schemas, images, sticky regions, or floating controls, also test 320 × 568 portrait and 844 × 390 landscape. One theme is sufficient for these checks unless theme-specific styling changes layout or visibility.
5. **Pass criteria:** A check passes only when the complete task remains usable; content hierarchy and primary actions remain readable and reachable; content and controls are not clipped or overlapped; the document does not scroll horizontally; intentional inner scrollers are visibly bounded and discoverable; interactions do not rely on hover; and contrast and focus remain visible in both themes.
6. **Evidence:** In the pull request description, list every route and state tested. Attach at least one screenshot or recording for each required baseline combination and each required compression viewport; evidence need not duplicate every tested state. Use recordings for changed interactions. Mark each inapplicable compression viewport as `N/A` with a reason, and report every check that could not run.
