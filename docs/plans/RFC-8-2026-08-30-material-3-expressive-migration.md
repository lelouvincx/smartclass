---
rfc: RFC-8
title: Material 3 Expressive design-system migration
date: 2026-08-30
status: Approved
dependencies: [RFC-3, RFC-6]
---

# RFC-8 — Material 3 Expressive design-system migration

**Date:** 2026-08-30

**Status:** Approved for staged implementation

**Decision owner:** Chinh

**Implementation status (2026-09-02):** The planned code changes and automated verification are complete. Final human visual approval is still pending; completion of the implementation does not imply visual acceptance.

## Trigger

Chinh approved adopting Material 3 Expressive as a reference direction and asked that the adoption boundary and implementation plan be persisted. SmartClass already has a calm LMS-informed system built with React, Tailwind, shadcn/Radix, semantic tokens, and a 125% root scale. The migration must evolve that foundation without disrupting the assessment workflow.

## Problem

A blanket “move to Material 3 Expressive” instruction is unsafe. It can mean visual inspiration, strict component compatibility, or replacing the component stack. Those interpretations have different costs and can make dense exercise, grading, and administration screens less efficient.

The repository therefore needs an explicit boundary, rollout sequence, and evidence gates that future agents can follow without turning a visual migration into a product or platform rewrite.

## Current state and constraints

- `DESIGN.md` defines a calm academic baseline, semantic colors, restrained elevation, accessible controls, and LMS layout rules.
- The implementation foundation is React, Tailwind CSS, and shadcn/Radix. Existing primitives carry behavior and accessibility that should not be casually replaced.
- Assessment and administration surfaces contain dense forms, tables, answer controls, timers, navigation, scores, and review data. Scanability and predictable interaction take priority there.
- SmartClass has natural milestone moments—creation, Start, completion, score, progress, and empty states—where stronger hierarchy can improve orientation.
- This RFC changes no product capability. Product truth remains in [`../../PRODUCT.md`](../../PRODUCT.md).

## Decision

SmartClass will be **Material-informed, not strictly Material-compatible**.

Use Material 3 Expressive as a reference for token structure, purposeful shape contrast, hierarchy, and motion. Keep the calm baseline for dense assessment and administration flows. Allow expressive emphasis only for:

- creation entry points and successful creation;
- starting an attempt;
- completion and submission milestones;
- score and progress communication; and
- empty states with a clear recovery action.

Do not conduct a wholesale component rewrite. Existing shadcn/Radix primitives remain the default until a specific component demonstrates a user, accessibility, maintenance, or interoperability benefit from changing.

## Oracle conclusions accepted

The approved plan incorporates the Oracle review conclusions:

1. Treat Material 3 Expressive as a design reference, not a compatibility target.
2. Separate visual language adoption from component-library adoption.
3. Put the system into three token layers before broad page changes.
4. Protect dense workflows with a calm default and spend expression only on meaningful moments.
5. Roll out through representative vertical slices with explicit stop/go gates rather than a big-bang restyle.
6. Gate Material Web separately; do not add it merely to claim Material adoption.

## Token model

The implementation uses three layers:

1. **Reference:** raw color, typography, shape, spacing, elevation, and motion values derived from the chosen Material reference date (**2026-08-30**).
2. **Semantic:** product meaning such as canvas, surface, content, border, primary action, selection, focus, success, warning, danger, and expressive emphasis.
3. **Component:** bounded mappings for app shell, button, card, field, table, question navigation, score/progress, and empty state.

Rules:

- Product components consume semantic or component tokens, not raw reference values.
- Theme changes happen primarily at the semantic layer.
- Repeated one-off Tailwind values are a signal to define or revise a token.
- Existing useful LMS rules in [`../../DESIGN.md`](../../DESIGN.md)—density, readable scale, responsive navigation, accessible targets, status labels, and quiet elevation—remain constraints.

## Rollout plan

### Stage 0 — Baseline and inventory

**Agent actions**

- Inventory current tokens, shared compositions, primitives, and representative pages.
- Capture baseline desktop and 390px mobile evidence for one dense student flow, one dense teacher flow, and each intended expressive moment.
- Record existing accessibility, visual-regression, bundle, and interaction checks that can serve as gates.

**Chinh actions**

- Confirm the representative screens and that the baseline reflects current product intent.

**Expected outcome**

- A reviewable baseline and bounded migration surface; no production visual change.

**Go gate:** representative flows and measurable checks are agreed.

**Stop gate:** missing baseline, unclear ownership, or unresolved product behavior.

### Stage 1 — Three-layer token foundation

**Agent actions**

- Introduce or normalize reference, semantic, and component token layers without changing behavior.
- Map existing light/dark values and preserve the 125% root scale, contrast, and focus treatment.
- Add checks that catch undefined tokens and accidental raw reference-token use in product compositions where practical.

**Chinh actions**

- Review light/dark token samples and approve the calm baseline before page migration.

**Expected outcome**

- A stable theme contract that can absorb visual iteration without page-level drift.

**Go gate:** baseline screens remain functionally and visually equivalent apart from approved token normalization; WCAG AA and focus visibility hold.

**Stop gate:** regressions in contrast, density, theme parity, or uncontrolled one-off values.

### Stage 2 — Calm shared foundations

**Agent actions**

- Migrate app shell, page header, buttons, cards, fields, navigation, tables, status treatments, and focus states to component tokens.
- Keep dense assessment/admin compositions restrained; preserve control placement, readable row density, and touch targets.
- Verify desktop, mobile, light, dark, keyboard, and reduced-motion behavior.

**Chinh actions**

- Review representative student and teacher dense flows for familiarity and efficiency.

**Expected outcome**

- Consistent Material-informed foundations with no expressive overreach.

**Go gate:** core tasks remain as clear and compact as the baseline, with no critical accessibility or interaction regression.

**Stop gate:** reduced scanability, displaced primary controls, excess rounding/elevation, or migration requiring broad behavioral rewrites.

### Stage 3 — Expressive vertical slices

**Agent actions**

- Apply one bounded expressive treatment at a time to creation, Start, completion, score/progress, and empty states.
- Use shape, color, scale, and motion to establish one focal point; keep surrounding data and controls calm.
- Respect reduced motion and avoid animation that delays action or feedback.

**Chinh actions**

- Approve each moment as a visual review set before expanding the pattern.
- Reject treatments that feel promotional, distracting, or inconsistent with an academic workspace.

**Expected outcome**

- Important transitions and outcomes feel more distinct while working screens remain dependable.

**Go gate:** the focal action/state is clearer, surrounding density is preserved, and reduced-motion behavior is complete.

**Stop gate:** expression competes with the exercise, score meaning depends on color/motion, or the pattern spreads beyond the approved boundary.

### Stage 4 — Consolidate and document

**Agent actions**

- Remove superseded token aliases and duplicate local styling only after all consumers migrate.
- Update component examples, regression coverage, and `DESIGN.md` when implementation evidence changes the contract.
- Record intentional divergences rather than silently forcing compatibility.

**Chinh actions**

- Perform final cross-flow review and approve completion or a bounded follow-up list.

**Expected outcome**

- One maintainable visual system, documented exceptions, and no stranded migration layer.

**Go gate:** representative flows pass and no obsolete path has active consumers.

**Stop gate:** cleanup would remove a still-used compatibility path or conceal unresolved regressions.

## Material Web adoption gate

Material Web is **not approved as part of this RFC**. Evaluate it only after Stages 1–3 demonstrate a concrete component gap.

Adoption requires all of the following:

1. A named component/use case where current shadcn/Radix primitives cannot meet the requirement cleanly.
2. Verified React integration and event/form/focus behavior, including server rendering assumptions if applicable.
3. Accessibility and keyboard behavior at least equal to the current primitive.
4. Acceptable bundle, styling, theming, testing, and maintenance cost.
5. No duplicate design-system ownership or forced rewrite of unrelated components.
6. A reversible prototype and Chinh's explicit approval after review.

If any condition fails, continue with the Material-informed token and composition approach. Material Web adoption, if approved later, should begin with one isolated component and its own implementation decision.

## Validation across stages

- Compare representative dense and expressive screens against the Stage 0 baseline at desktop and 390px mobile widths.
- Test light/dark themes, keyboard traversal, visible focus, labels, WCAG AA contrast, and `prefers-reduced-motion`.
- Run focused component and flow tests plus the production build.
- Review bundle impact whenever a dependency or web component is proposed.
- Stop rollout on regressions; do not normalize them as the cost of visual consistency.

## Consequences

- SmartClass can use Material 3 Expressive ideas without claiming strict compatibility.
- Existing component behavior and LMS density are protected while tokens and compositions evolve.
- Expressive treatments remain scarce enough to communicate milestones.
- The staged approach takes longer than a global restyle but makes visual, accessibility, and platform regressions observable and reversible.

## Approval and future changes

Chinh approved all stages and the action/review split recorded here on 2026-08-30. This approval authorizes staged implementation subject to each stop/go gate; it does not pre-approve Material Web or waive per-stage review. Changes to the expressive boundary, component stack, or product behavior require a revision to this RFC (or a superseding RFC) and explicit approval.
