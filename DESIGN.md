---
version: alpha
name: SmartClass Learning System
description: A calm, accessible academic interface for focused teaching and learning workflows.
colors:
  primary: "#2563EB"
  on-primary: "#FFFFFF"
  canvas: "#F8FAFC"
  surface: "#FFFFFF"
  surface-subtle: "#F5F6FA"
  selection: "#EFF6FF"
  text: "#0F172A"
  text-secondary: "#475569"
  text-muted: "#64748B"
  border: "#E2E8F0"
  success: "#15803D"
  success-muted: "#F0FDF4"
  warning: "#A16207"
  warning-muted: "#FEFCE8"
  danger: "#B91C1C"
  danger-muted: "#FEF2F2"
  chart-blue: "#2563EB"
  chart-teal: "#0D9488"
  chart-violet: "#7C3AED"
  chart-amber: "#D97706"
  chart-pink: "#DB2777"
typography:
  page-title:
    fontFamily: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif
    fontSize: 1.75rem
    fontWeight: 700
    lineHeight: 1.2
  section-title:
    fontFamily: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif
    fontSize: 1rem
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
  metadata:
    fontFamily: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif
    fontSize: 0.8125rem
    fontWeight: 500
    lineHeight: 1.5
rounded:
  sm: 6px
  md: 8px
  lg: 10px
  xl: 14px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
components:
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
  primary-button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.lg}"
  active-navigation:
    backgroundColor: "{colors.selection}"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
  app-canvas:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text}"
  sidebar:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.text-secondary}"
  metadata:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-muted}"
  divider:
    backgroundColor: "{colors.border}"
    height: 1px
  chart-series-1:
    backgroundColor: "{colors.chart-blue}"
  chart-series-2:
    backgroundColor: "{colors.chart-teal}"
  chart-series-3:
    backgroundColor: "{colors.chart-violet}"
  chart-series-4:
    backgroundColor: "{colors.chart-amber}"
  chart-series-5:
    backgroundColor: "{colors.chart-pink}"
  status-success:
    backgroundColor: "{colors.success-muted}"
    textColor: "{colors.success}"
    rounded: "{rounded.xl}"
  status-warning:
    backgroundColor: "{colors.warning-muted}"
    textColor: "{colors.warning}"
    rounded: "{rounded.xl}"
  status-danger:
    backgroundColor: "{colors.danger-muted}"
    textColor: "{colors.danger}"
    rounded: "{rounded.xl}"
---

## Overview

SmartClass is a focused learning workspace, not a marketing surface. Its atmosphere is calm, dependable, and academically neutral: cool slate foundations, one confident blue for action and selection, compact metadata, and quiet surfaces that keep attention on exercises and results.

The source evidence was the authenticated Uniapp LMS course list, expanded course, home, tests, results, empty states, and mobile navigation inspected on 25 August 2026 at 1200 × 913 and 390 × 844. SmartClass adapts the useful interaction principles—clear active navigation, compact learning metadata, low-elevation cards, and recoverable empty states—without copying Uniapp branding, logos, photography, content, or exact compositions. Existing SmartClass React, Tailwind, and shadcn conventions remain the implementation foundation.

The normative implementation tokens live in `src/design-system/tokens.css`. Product-level compositions live in `src/design-system/`; low-level shadcn primitives remain in `src/components/ui/`.

## Colors

Use `canvas` for the page, `surface` for cards and overlays, and `surface-subtle` for persistent navigation. The slate text hierarchy is deliberate: `text` for decisions and headings, `text-secondary` for supporting prose, and `text-muted` only for metadata that can safely recede.

Blue means interaction, current location, or focus. Use `selection` with blue text for selected navigation and metadata wells; reserve solid `primary` for the primary action. Do not fill large decorative areas with blue.

Success, warning, and danger always combine color with text or an icon. Never use a green check alone to distinguish “complete”, “correct”, and “approved”. Use the chart palette in listed order, and add direct labels or patterns where categories could otherwise depend on color alone.

All body text and interactive labels must meet WCAG AA contrast. Focus rings use `primary` and remain visible in both themes.

## Typography

Use the native system sans stack for fast rendering and familiar controls across devices. Page titles are bold and compact; section titles are semibold; body text stays regular. Keep descriptions to readable line lengths rather than stretching them across the workspace.

SmartClass uses `html { font-size: 125% }` as a readable default without making dense learning workflows feel zoomed in. Relative type and spacing scale from that baseline; do not reset it inside components. Use tabular numerals for times and scores when alignment matters.

## Layout

Desktop uses a fixed, quiet sidebar with a centered content column no wider than 64rem. Main page composition follows a 24–32px vertical rhythm. Cards use 16–24px internal padding and responsive grids rather than fixed card widths.

At mobile widths, replace the sidebar with a labelled menu button and a left drawer. The drawer must close through its close control, overlay dismissal, Escape, and route selection. Keep every interactive target at least 44 × 44 CSS pixels. Tables may scroll horizontally, but primary actions and essential labels must remain discoverable without hover.

Prefer summary cards and dedicated detail routes over unbounded inline expansion. Long titles wrap or expose their full value; truncation requires a full-title affordance.

## Elevation & Depth

Default cards use a 1px `border` plus the low card shadow defined in `tokens.css`. Use the raised shadow only for temporary overlays, drawers, and menus. Hierarchy should come primarily from spacing, typography, and surface contrast—not stacks of floating containers.

Avoid nested cards when a divider, heading, or grouped row communicates the same relationship. Sticky regions need an opaque or blurred surface and a separating border.

## Shapes

Use 14px corners for cards and 10px corners for controls, selected navigation, and icon wells. Use pills only for short statuses, tags, and compact metadata. Do not make ordinary buttons or content containers fully rounded.

Icons use the Lucide outline family at 16–20px. They support labels rather than replace them unless the control has an explicit accessible name.

## Components

- **App shell:** `AppShell` owns desktop navigation, the labelled mobile drawer, current-route state, account controls, and the responsive content boundary.
- **Page header:** `PageHeader` provides one semantic `h1`, a concise description, and optional right-aligned actions. Do not put a page title in a card solely to create visual weight.
- **Cards:** use a white surface, slate border, 14px radius, and low elevation. Entire-card links need a clear focus ring and directional cue.
- **Action cards:** use an icon well, action name, one-line outcome, and trailing arrow. Keep the whole card clickable.
- **Empty states:** `EmptyState` uses a semantic heading, explains what happened, and offers one recovery action when the user can proceed.
- **Buttons:** show one primary action per local group. Secondary actions are outline or quiet. Labels use verbs and controls remain large enough for touch.
- **Navigation:** current location uses blue text on `selection`, not a solid blue rail. Every item combines icon and text.
- **Tables and metadata:** use muted headers, restrained row separators, and explicit column labels. Scores and statuses include text, not color alone.
- **Disclosures:** summarize collapsed content and keep expanded learning rows grouped. Move complex or lengthy work to a dedicated page.

## Do's and Don'ts

- **Do** keep learning content, progress, and the next action visually dominant.
- **Do** use semantic headings, landmarks, current-route state, visible focus, and labelled icon controls.
- **Do** provide useful empty-state recovery and preserve full access to long titles.
- **Do** test the shell and primary tasks at desktop and 390px mobile widths.
- **Don't** copy third-party brand assets, course images, or proprietary copy into SmartClass.
- **Don't** use controls smaller than 44 × 44px or rely on hover-only actions.
- **Don't** let support widgets, floating controls, or sticky actions overlap learning content.
- **Don't** use ambiguous green checks or status color without a textual label.
- **Don't** create excessive inline expansion that pushes the next course or task far below the fold.
