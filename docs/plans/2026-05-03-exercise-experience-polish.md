# RFC: v0.4.5 — Exercise Experience Polish

**Date:** 2026-05-03
**Status:** Draft
**Author:** lelouvincx + Amp

### Revision History

| Rev | Date       | Changes        |
| --- | ---------- | -------------- |
| v1  | 2026-05-03 | Initial draft. Inserts a UX-only minor version between v0.4 (image extraction, shipped) and v0.5 (lectures, planned). Driven by customer feedback and a benchmark of Shub.edu.vn captured in [`docs/learning.md`](file:///Users/lelouvincx/Developer/smartclass/docs/learning.md). |
| v2  | 2026-05-03 | Fold in open items from [`docs/uiux-feedback.md`](file:///Users/lelouvincx/Developer/smartclass/docs/uiux-feedback.md): drag-and-drop file upload, expandable question list (alternative to nav grid + scroll), 150 % default zoom, trim image-extraction model allowlist to `x-ai/grok-4.1-fast` + `mistralai/mistral-small-3.2-24b-instruct`. Reverses the "no API/no DB changes" claim — the allowlist trim is a small backend edit. |
| v3  | 2026-05-03 | Resolve all 8 open questions. **Drop the expandable per-question list entirely** (was prototype-gated; now out of scope for v0.4.5 — revisit in v0.5 with a fresh design). **Take-page PDF default flips to ON** (off later when the QR-code submission flow from the README's queue lands). **Change extract default from `x-ai/grok-4.1-fast` to `mistralai/mistral-small-3.2-24b-instruct`** — stale model IDs and `NULL` values both resolve to Mistral. **PDF margin replaces "readability" as the rationale for 150 %** zoom. Close items 1, 3, 4, 5, 6, 8 with explicit decisions (see Decisions table). |

---

## Motivation

v0.4 closed the last functional gap in the core take/review loop: students can now submit a photo and have answers extracted, on top of the manual form added in v0.2 and the split-pane review added in v0.3. Functionally, the loop is complete.

But the **experience** of taking a 25-question exercise is still the v0.2 baseline: a single long scroll of question cards with no per-question navigation, a timer that lives inline at the top, no pre-start landing, and a post-submit echo that drops the student back into the take page. After the v0.4 ship, two signals converged:

1. **Customer feedback (informal, post-v0.4 testing with prospects/teachers):**
   - Students "lose their place" on long exercises and want a way to jump back to a specific question.
   - Teachers want a "are you sure?" prompt that tells students *how many* questions are still blank — not just a generic confirm.
   - Several testers compared us unfavorably to Shub.edu.vn ("their UI feels more like a real exam") — specifically the persistent sidebar with the answer-sheet grid.
   - Post-submit, students can't easily distinguish "wrong" from "skipped" — both currently look like a red ✗.

2. **Benchmark of Shub.edu.vn** (full notes in [`docs/learning.md`](file:///Users/lelouvincx/Developer/smartclass/docs/learning.md)):
   - Pre-start landing card with metadata + green CTA → reduces accidental session starts and gives a clear "begin" moment for timer accuracy.
   - Two-column take layout with a sticky sidebar "control center" (timer + navigation grid + actions) → the navigation grid is the single most-cited UX element in feedback.
   - Submit confirmation modal that names the exact unanswered count (e.g., "23 câu chưa làm").
   - Results summary page with a green/red/grey dot breakdown (correct / incorrect / unanswered) before drilling into the per-question review.
   - Per-question status sidebar in the review page (status dot, q#, chosen, correct, points).

This RFC bundles those gaps into a single minor release, **v0.4.5**, ahead of v0.5 (lectures). It is purely UX/UI — no new product capabilities, no schema changes (one possible exception in the Open Questions), no new third-party integrations. The intent is to ship a release that makes the existing functionality feel professional before we expand surface area into lectures.

### Why a separate version (and not folded into v0.5)?

- v0.5 (lectures) is a new **product surface**; v0.4.5 is a **polish pass on the existing surface**. Mixing them muddies the release narrative ("did lectures break the take page or did the polish?").
- The take page is already 697 lines with intricate timer + navigation-guard + extraction state. Restructuring it next to a new lectures feature increases the blast radius of either change.
- Customer feedback is concrete and testable now. Lectures need more discovery first.

### Why now (and not after v0.5)?

- The core loop is what prospects evaluate during sales calls. Polishing it directly moves the conversion needle, while lectures are a "nice to have" until students have something graded to study from.
- The take page restructure is on the critical path for any future v0.6 mobile-responsiveness work; better to land it before we add more UI on top.

---

## Scope

In:

1. **Pre-start landing page** at `/student/exercises/:id` — metadata card (title, type, duration, question count, timed/untimed badge) with a primary "Start" CTA. The take session moves to `/student/exercises/:id/take`. Submission row is created when the student clicks **Start**, not on page mount of the metadata page.
2. **Two-column take layout with a sticky sidebar "control center"** on `/student/exercises/:id/take`:
   - Sidebar (right, sticky on desktop / bottom-sheet drawer on mobile): timer block, exercise info (title + current question + point value), question navigation grid, submit button, exit button.
   - Main column (left): existing question feed and the existing PDF split-pane. **PDF visible by default** (toolbar toggle still available to hide it). The "default off" behavior is queued for whenever the QR-code submission flow from the README queue lands — that flow assumes a printed exercise sheet, so the on-screen PDF becomes redundant. Persisted toggle key: `smartclass-take-pdf-visible`.
3. **Question navigation grid** ("Phiếu trả lời"): 5-column grid of numbered cells. States: `unanswered` (faint border), `answered` (filled background + chosen value, e.g., `1:A` for MCQ, `2:✓` for any-answered boolean, `3:42` truncated for numeric), `current` (blue ring). Click scrolls the main column to that question via `scrollIntoView({ behavior: 'smooth', block: 'center' })`.
4. **Live answer indicator on the grid** — updates on every form change, no extra round-trip.
5. **Submit confirmation dialog** with dynamic unanswered count: `"You have N questions unanswered. Submit anyway?"` when `N > 0`; otherwise `"Submit your answers?"`. Counts a boolean question as unanswered iff **all four** sub-questions are unanswered (consistent with how the navigation grid treats it).
6. **Results summary page** at `/student/submissions/:id/summary` after submit: large score badge, breakdown row with three counters (✓ correct / ✗ incorrect / − unanswered), exercise title, time taken, submitted timestamp, primary CTA "View detailed results" → existing review page.
7. **Per-question status sidebar on the review page**: small table with columns `status dot | q# | chosen | correct | (points)`. Reuses `gradeSubmission` per-question output already computed in v0.2.
8. **Distinguish "incorrect" from "skipped"** in the post-submit and review views. Today both render as `✗`. Skipped becomes a grey `−` dot; incorrect stays red `✗`. Updates [`src/components/answer-result.jsx`](file:///Users/lelouvincx/Developer/smartclass/src/components/answer-result.jsx).
9. **Deselect / clear-answer affordance** on MCQ rows: a small `✗` button on the selected row clears the answer (matches Shub). Boolean and numeric already have a "clear" affordance via the input itself.
10. **Drag-and-drop file upload** for teacher PDF/image inputs (`TeacherCreateExercisePage`, `TeacherViewExercisePage` edit mode). Adds a dropzone overlay using the same pattern as `AnswerImageUpload` from v0.4 — drag, drop, file dialog still works. Source: open item in `uiux-feedback.md`.
11. **Default 150 % zoom** for the app shell. **Primary motivation**: the current page margins (`max-w-4xl px-8` from the v0.4 layout fix) leave a lot of vertical real estate unused on dense pages — the bump scales every typographic unit at once and effectively reclaims the whitespace as readable content. Implementation is a root font-size bump (`html { font-size: 150%; }`) plus a `clamp()` on the take-page sidebar's fixed `320px` width. **No** layout-margin changes (`max-w-4xl px-8` stays); we get the same visual effect via type scale. Whether 150 % is the right number, or it should be 125–130 % with a separate margin tweak, is decided **inside PR D** based on the regression-sweep results, not in this RFC. Source: open item in `uiux-feedback.md`.
12. **Trim image-extraction model allowlist** in `worker/lib/extract-models.js` to two entries: **`x-ai/grok-4.1-fast`** (kept, no longer default) and **`mistralai/mistral-small-3.2-24b-instruct`** (new, **becomes the default**). Drop `google/gemini-2.5-flash` and `openai/gpt-4o-mini`. Source: open item in `uiux-feedback.md`. **Backwards compatibility**: existing `exercises.extract_model` rows pointing to dropped IDs (or `NULL`) silently fall back to the new default via `resolveModel()` — exactly the existing stale-ID behavior, just with a different default value. **No migration** required; **no notification** to teachers about the default change (the picker shows what's currently active and that's enough — see Open Questions resolution). PR D adds a worker test that asserts: (a) `resolveModel(null)` returns Mistral; (b) `resolveModel('google/gemini-2.5-flash')` returns Mistral.

Out (deferred to v0.5 / v0.6 / later):

- **Expandable per-question list layout** — was a v2 prototype-gated scope item; now fully out of v0.4.5 per Open Questions resolution. To be revisited in v0.5 with a fresh design pass before any code lands; v0.4.5 ships the long-scroll + sidebar grid as the only take-page layout.
- **Take-page PDF default off** — kept on for v0.4.5; flips to off when the QR-code submission flow from the README queue is implemented (a printed exercise sheet makes the on-screen PDF redundant).
- **Deselect / clear-answer affordance on numeric and boolean rows** — MCQ deselect is shipped (item 9); the equivalent for numeric (clear input) and boolean (toggle off) is **out** for v0.4.5. Native input/clearing already works.
- **Notifying teachers when their pinned model is dropped** — silent fallback to the new default (Mistral) is sufficient for v0.4.5.
- Teacher toggle for solution/correct-answer visibility per exercise (sales-call ask, but a real product decision — needs its own RFC).
- Multiple-attempt history tab on the review page (we don't allow retakes yet; punted to whenever retakes ship).
- Student-vs-original version toggle on the review page (no concept of "original" yet).
- Social share buttons on the landing/results page (marketing-driven; ties into v0.6).
- Live-camera scanner framing UI (already deferred from v0.4).
- Mobile-responsive polish of the new sidebar beyond a basic bottom-sheet drawer (full pass is v0.6).

---

## Current state

| What                                                  | Status                                                                                              |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `/student/exercises/:id`                              | **Is the take page itself.** Submission is created on mount. No metadata-only landing.              |
| `StudentTakeExercisePage.jsx` layout                  | Single-column scroll. Timer block at top. PDF in `PdfSplitPane` (60/40 desktop, collapsible mobile).|
| Per-question navigation                               | **None.** Students must scroll to find a question.                                                  |
| Submit confirmation                                   | Dialog exists but message is static. No unanswered count surfaced.                                  |
| Post-submit view                                      | Read-only echo rendered inline on the take page; score + ✓/✗ per row.                               |
| `/student/submissions/:id/summary`                    | **Missing route.** Students go straight from submit → in-place echo → manually navigate to review.  |
| Skipped vs incorrect visual distinction               | **None.** Both render as a red `✗` (`CorrectnessIcon` in `answer-result.jsx`).                      |
| Review page sidebar                                   | **None.** Review shows only the question feed + PDF split-pane.                                     |
| MCQ deselect                                          | **None.** Once selected, a student must pick a different option to change.                          |
| Submission lifecycle docs                             | v0.2 design decision: "Submission created immediately when student lands on the page." This RFC explicitly revises that — see Decisions. |

---

## Decisions

| Decision                                       | Choice                                                                                          | Rationale                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Where to create the submission                 | **On click of "Start"** on the new landing page, not on mount of the take page                  | Reverses the v0.2 decision. v0.2 created early to keep `started_at` accurate; with a dedicated landing page that's a one-click step away, the ~1 s delay is negligible and we avoid orphan submissions when students click into an exercise to read the metadata and bounce. Timer accuracy is preserved because the row is still created server-side before the take page mounts.       |
| Routing split                                  | `/student/exercises/:id` (landing, metadata only) + `/student/exercises/:id/take` (take page)   | Matches Shub's pre-start card pattern. Allows future "guest sees the landing page first" flow in v0.6 without restructuring. Existing `/student/exercises/:id` route → repurposed as landing; redirect from old links is unnecessary because no production data points there.                                                                                                            |
| Sidebar implementation                         | **CSS grid `lg:grid-cols-[1fr_320px]`** on the take page; sidebar uses `position: sticky; top:`  | Plain CSS, no extra dep. Width is fixed (`320px`) instead of fractional so the navigation grid stays a clean 5-column layout regardless of viewport.                                                                                                                                                                                                                                     |
| Sidebar on mobile                              | Collapsible bottom drawer (Radix `Sheet` from shadcn/ui)                                        | Sticky right sidebar fights touch scroll. A drawer that opens via a floating "Phiếu" (answer sheet) button keeps the navigation grid one tap away without consuming permanent screen real estate. Drawer state is local component state — no persistence needed.                                                                                                                          |
| PDF split-pane interaction with sidebar        | **PDF on by default**, toolbar toggle to hide. Flips to off when the QR-code flow lands.        | The current v0.3 take page already shows the PDF; defaulting to off would be a regression for students who rely on it mid-question. The QR-code submission flow (README queue) is the natural moment to flip the default — at that point students physically have the printed sheet in hand, so the on-screen PDF becomes redundant. Until then, on. Persisted toggle key `smartclass-take-pdf-visible`. |
| Question navigation grid cell content          | MCQ → `n:LETTER`; numeric → `n:VALUE` (truncated to 4 chars); boolean → `n:✓` if any sub-answered, `n` otherwise | Mirrors Shub but generalized. Truncation prevents long numeric answers ("12.345...") from breaking the grid layout.                                                                                                                                                                                                                                                                       |
| Submit dialog unanswered count                 | **Computed client-side** from current form state at click time                                  | The form state is the source of truth on the client. Counting client-side avoids a pre-flight API call. Backend remains the final authority on what gets graded.                                                                                                                                                                                                                          |
| Boolean question "answered" definition         | **All 4 sub-questions answered** = answered for the unanswered-count and grid-color purposes    | Treating "1 of 4 sub-answered" as answered hides incomplete state from the student. Treating "any answered" as fully answered is misleading. Strict definition matches the grading model where each sub-question contributes independently.                                                                                                                                              |
| Skipped distinct from incorrect                | New `'skipped'` correctness state in `answer-result.jsx`; rendered as grey `−` dot              | Today `is_correct = 0` covers both "wrong" and "didn't answer". The DB already distinguishes them: `submission_answers.submitted_answer IS NULL` ↔ skipped. We just stop collapsing them in the UI. **No DB migration**: detection is `submitted_answer === null` at render time.                                                                                                          |
| Results summary page                           | New page at `/student/submissions/:id/summary`; existing review page unchanged in URL/data       | Smallest change to existing code. Summary page reuses `GET /api/submissions/:id` (no new endpoint), computes the three counters client-side. Take page stops rendering the post-submit echo and instead `navigate('/student/submissions/:id/summary')` after the submit response succeeds.                                                                                                |
| Per-question points in review sidebar          | Computed client-side from the schema using the same constants as `worker/lib/grading.js`         | The grading constants (`MCQ_POINTS`, `NUMERIC_POINTS`, `BOOLEAN_SCORE_TABLE`) are stable and small. Duplicate them in `src/lib/grading-display.js` (read-only mirror, with a comment pointing to the worker file as source of truth). No API change. If they ever drift, a frontend test pinned to specific values catches it.                                                              |
| Translations / copy                            | English copy in v0.4.5; Vietnamese strings noted as future i18n                                 | i18n setup is its own RFC. Use clear English ("Answer Sheet", "Submit", "Time remaining") for now; the Shub Vietnamese strings in `learning.md` are reference, not requirements.                                                                                                                                                                                                          |
| Expandable per-question list (feedback item)   | **Out of v0.4.5.** Revisited in v0.5 starting from a fresh design                                | v2 of this RFC scoped a `?layout=list` prototype; v3 drops it. The feedback note ("need design first") is taken literally — building any code, even prototype code, ahead of a design pins our thinking. v0.4.5 ships a single take-page layout (long-scroll + sidebar grid). The expandable list reopens cleanly in v0.5 once a design exists.                                  |
| Drag-and-drop file upload (feedback item)      | Extract the dropzone behavior from `AnswerImageUpload` into a shared `file-dropzone.jsx` primitive; reuse on teacher pages | We already have a working dropzone for student image uploads (v0.4 PR C). Duplicating that logic vs. extracting once costs the same in PR D, and the extracted primitive pays off again whenever upload UI is added later (lectures will need video URL input only, not files, but future asset uploads will).                                                                       |
| 150 % zoom (feedback item)                     | Root `font-size: 150%` (i.e., `24px`); reclaim the **page-margin whitespace** as readable type. `clamp()` on fixed-width take-page sidebar. Final number tunable inside PR D. | The page margins from the v0.4 fix (`max-w-4xl px-8`) are the actual problem the customer is complaining about. We can either narrow the margins or scale the type — scaling type is one line and uniform across the app. PR D's regression sweep is the place to decide if 150 % is right or if 130 % + a width tweak is better. Either way, no per-component scaling — that path leads to drift. |
| Model allowlist trim (feedback item)           | Edit `worker/lib/extract-models.js` directly. **Default changes from `x-ai/grok-4.1-fast` to `mistralai/mistral-small-3.2-24b-instruct`.** Keep both in the allowlist. Drop Gemini + GPT-4o-mini. | The customer asked for these two only; combined with their preference signal, Mistral becomes the new default. Stale `extract_model` values (Gemini, GPT-4o-mini) and `NULL` rows both resolve to Mistral via existing `resolveModel()` logic — no migration needed. Frontend `ExtractModelSelect` reads `GET /api/extract-models` at mount; no frontend deploy required. |
| Reload after submit                            | Reloading the take URL after a submit lands on the **landing card** showing a "Submitted" inline banner with a primary "View result" button | Replaces the in-place echo with a clear "this exercise is done" surface. Detection is server-side: the landing-card loader checks `GET /api/submissions?exercise_id=X&limit=1`; if the latest submission for this user has `submitted_at != null`, render the banner instead of the Start CTA. No new endpoint. |

---

## Detailed design

### 1. Routing changes

```diagram
Before:                                After:
╭────────────────────────╮             ╭────────────────────────╮
│ /student/exercises     │             │ /student/exercises     │
╰───────────┬────────────╯             ╰───────────┬────────────╯
            ▼                                      ▼
╭────────────────────────────╮         ╭────────────────────────────╮
│ /student/exercises/:id     │         │ /student/exercises/:id     │
│ (take page; submission     │         │ (landing card; no submission│
│  created on mount)         │         │  yet)                      │
╰───────────┬────────────────╯         ╰───────────┬────────────────╯
            ▼                                      │  click Start
╭────────────────────────────╮                     │  → POST /api/submissions
│ submit → in-place echo     │                     ▼
╰────────────────────────────╯         ╭────────────────────────────────╮
                                       │ /student/exercises/:id/take    │
                                       │ (take page; sidebar + grid)    │
                                       ╰───────────┬────────────────────╯
                                                   ▼  submit
                                       ╭────────────────────────────────╮
                                       │ /student/submissions/:id/summary│
                                       │ (score + breakdown + CTA)      │
                                       ╰───────────┬────────────────────╯
                                                   ▼  View details
                                       ╭────────────────────────────────╮
                                       │ /student/submissions/:id/review│
                                       │ (existing page + new sidebar)  │
                                       ╰────────────────────────────────╯
```

### 2. Take-page layout

```diagram
Desktop (lg+):
╭───────────────────────────────────────────────────────╮
│ Top bar: title • back/exit • Photo/Manual mode toggle │
├──────────────────────────────────────┬────────────────┤
│ Main column (1fr)                    │ Sidebar (320px)│
│ ╭─────────────────────────────────╮  │ ╭────────────╮ │
│ │ [PDF on by default]             │  │ │ Timer      │ │
│ │ [toolbar: hide PDF | extract..] │  │ ╰────────────╯ │
│ ╰─────────────────────────────────╯  │ ╭────────────╮ │
│ ╭─────────────────────────────────╮  │ │ Q1 • 0.25  │ │
│ │ Q1: ...                         │  │ ╰────────────╯ │
│ │ [A] [B] [C] [D]                 │  │ ╭────────────╮ │
│ ╰─────────────────────────────────╯  │ │ Phiếu      │ │
│ ╭─────────────────────────────────╮  │ │ ┌─┬─┬─┬─┬─┐│ │
│ │ Q2: ...                         │  │ │ │1│2│3│4│5││ │
│ ╰─────────────────────────────────╯  │ │ ├─┼─┼─┼─┼─┤│ │
│   ...                                │ │ │6│7│8│9│..││ │
│                                      │ │ └─┴─┴─┴─┴─┘│ │
│                                      │ ╰────────────╯ │
│                                      │ [ Submit     ] │
│                                      │ [ Exit       ] │
╰──────────────────────────────────────┴────────────────╯

Mobile (< lg):
╭───────────────────────────────────╮
│ Top bar + sticky timer            │
├───────────────────────────────────┤
│ Main column (full width)          │
│ Q1 ...                            │
│ Q2 ...                            │
│   ...                             │
├───────────────────────────────────┤
│ Floating "Phiếu" button (bottom)  │
╰───────────────────────────────────╯
            │ tap
            ▼
╭───────────────────────────────────╮
│ Sheet drawer from bottom:         │
│ Timer • Grid • Submit • Exit      │
╰───────────────────────────────────╯
```

### 3. Question navigation grid component

New file: [`src/components/question-nav-grid.jsx`](file:///Users/lelouvincx/Developer/smartclass/src/components/question-nav-grid.jsx).

Props: `{ schema, answers, currentQId, onJump }`.

Per-cell logic:

```js
function cellState(qId, schema, answers) {
  const subRows = schema.filter(r => r.q_id === qId)
  const type = subRows[0].type
  if (type === 'mcq' || type === 'numeric') {
    const a = answers[qId]
    return a == null
      ? { kind: 'unanswered' }
      : { kind: 'answered', label: type === 'mcq' ? a : truncate(a, 4) }
  }
  // boolean: answered iff all 4 sub-rows have an answer
  const allAnswered = subRows.every(r => answers[`${qId}:${r.sub_id}`] != null)
  return allAnswered
    ? { kind: 'answered', label: '✓' }
    : { kind: 'unanswered' }
}
```

Cell rendering uses Tailwind only (no new shadcn primitives). Current question gets `ring-2 ring-primary`.

### 4. Submit confirmation

Existing dialog gets a dynamic message:

```js
const unanswered = countUnanswered(schema, answers)
const message = unanswered > 0
  ? `You have ${unanswered} unanswered question${unanswered === 1 ? '' : 's'}. Submit anyway?`
  : 'Submit your answers?'
```

`countUnanswered` lives next to the grid component and reuses the same boolean rule.

### 5. Results summary page

New page: [`src/pages/StudentSummaryPage.jsx`](file:///Users/lelouvincx/Developer/smartclass/src/pages/StudentSummaryPage.jsx). Route: `/student/submissions/:id/summary`. Loads `GET /api/submissions/:id` (already enriched in v0.3 with `correct_answer` and `type`). Computes `{correct, incorrect, skipped}` from the rows:

```js
const counts = answers.reduce(
  (acc, a) => {
    if (a.submitted_answer == null) acc.skipped++
    else if (a.is_correct) acc.correct++
    else acc.incorrect++
    return acc
  },
  { correct: 0, incorrect: 0, skipped: 0 }
)
```

For boolean questions, this counts at the **sub-question** row level (which is the same level the backend grades at). The summary text reads "X correct of N answers" rather than "X correct of N questions" to keep the math honest. **Open question:** should we surface a per-question rollup instead? Leaning no — sub-row counts match the score formula and are easier to reconcile.

### 6. Review-page sidebar

Modify [`src/pages/StudentReviewPage.jsx`](file:///Users/lelouvincx/Developer/smartclass/src/pages/StudentReviewPage.jsx) to wrap its existing content in the same two-column layout as the take page. Sidebar shows:

- Score header (color-coded badge per existing v0.3 rules: green ≥ 7.0, yellow ≥ 4.0, red < 4.0).
- Time taken + submitted timestamp.
- Three-counter row (correct / incorrect / skipped).
- Per-question table:

| status | q   | chosen | correct | pts  |
| ------ | --- | ------ | ------- | ---- |
| 🟢     | 1   | B      | B       | 0.25 |
| 🔴     | 2   | A      | C       | 0.25 |
| ⚪     | 3   | —      | 7       | 0.50 |

Clicking a row scrolls the main column to that question (same behavior as the take grid).

### 7. Skipped vs incorrect

Add `'skipped'` to `CorrectnessIcon` in [`src/components/answer-result.jsx`](file:///Users/lelouvincx/Developer/smartclass/src/components/answer-result.jsx):

```jsx
function CorrectnessIcon({ status }) {
  if (status === 'correct') return <Check className="text-success" />
  if (status === 'incorrect') return <X className="text-destructive" />
  if (status === 'skipped') return <Minus className="text-muted-foreground" />
  return null
}
```

Callers compute `status` from `(submitted_answer, is_correct)` instead of just `is_correct`. No API or schema change.

### 8. MCQ deselect

Add a small `<button aria-label="Clear answer">×</button>` to the right of the selected MCQ row that clears `answers[qId]`. Uses existing form-change handler — no new state.

---

## Migration plan / phasing

Four PRs, sequenced to keep each one reviewable:

| PR    | Title                                  | Files (approx.)                                                                                                                                          | Verifies                                                                                                                                                                                |
| ----- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | Routing + landing card                 | New: `StudentExerciseLandingPage.jsx`. Edit: `router.jsx`, `StudentTakeExercisePage.jsx` (move submission-create from mount to `/take` mount).            | E2E: `/student/exercises/:id` shows metadata only; clicking Start creates the submission and navigates to `/take`. Timer behavior unchanged.                                            |
| **B** | Take-page sidebar + nav grid + submit dialog count + skipped state | New: `question-nav-grid.jsx`, plus tests. Edit: `StudentTakeExercisePage.jsx` (layout, dialog, PDF on by default), `answer-result.jsx` (skipped status), `pdf-split-pane.jsx` (toolbar toggle stays). | Tests: `question-nav-grid.test.jsx` covers all 3 types + current/answered/unanswered states + click-to-jump. Take-page test updated for new layout. Skipped renders as grey dash. PDF visible on first mount. |
| **C** | Summary page + review sidebar + MCQ deselect + submitted-state banner on landing | New: `StudentSummaryPage.jsx`, `submission-summary-sidebar.jsx`, plus tests. Edit: `router.jsx`, `StudentReviewPage.jsx`, `StudentTakeExercisePage.jsx` (navigate to summary on submit), `StudentExerciseLandingPage.jsx` (detect submitted state, render banner + "View result"), MCQ row in take page. | E2E: submit → lands on summary with correct counters → "View details" → review with sidebar that scrolls main on click. Reload landing URL after submit → "Submitted" banner with "View result" button (links to summary or review). |
| **D** | Feedback round-up: drag-and-drop file upload + 150 % zoom + model allowlist trim + default flip | New: `src/components/file-dropzone.jsx` (extracted dropzone primitive shared by `AnswerImageUpload` and the new teacher inputs). Edit: `TeacherCreateExercisePage.jsx`, `TeacherViewExercisePage.jsx` (use dropzone), `src/index.css` (root font-size 150 %; tunable during sweep), take-page sidebar width `clamp(...)`, `worker/lib/extract-models.js` (allowlist trim **and** default flip to Mistral). New worker tests for fallback to Mistral. | Tests: dropzone accepts drop + click; visual-regression sweep on every student/teacher page (login, register, both dashboards, exercises lists, landing, take, summary, review, both teacher exercise pages); `resolveModel(null)` returns Mistral; `resolveModel('google/gemini-2.5-flash')` returns Mistral; `GET /api/extract-models` returns 2 models; existing `answer-image-upload.test.jsx` still green. |

DB migrations: **none**. API surface: **only** the implicit shape of `GET /api/extract-models` shrinks (2 models instead of 3); no breaking shape change. Worker tests should remain green throughout (sanity check: run `npx vitest run --config vitest.worker.config.js` after each PR to confirm). PR D is intentionally last so the global zoom + model trim land on top of stable take/review UX, not in the middle of the restructure.

---

## Risks & mitigations

| Risk                                                                                          | Likelihood | Impact | Mitigation                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Take page (`StudentTakeExercisePage.jsx`, ~700 lines) becomes harder to maintain after layout restructure | Med        | Med    | Extract grid + sidebar into their own components (`question-nav-grid.jsx`, `take-sidebar.jsx`). Don't pull logic into them — keep state in the page. Component split is structural only.                    |
| Reverting the v0.2 "submission on mount" decision regresses the timer-on-refresh fix from PR #19 | Med        | High   | Timer accuracy still derives from `started_at`. Session persistence in `sessionStorage` keyed by exercise ID still applies — just keyed at the `/take` mount instead of the now-defunct `/:id` mount. Add a worker integration test that validates `started_at` accuracy under the new flow. |
| Frontend tests around the existing layout break en masse (`StudentTakeExercisePage.test.jsx` is 29 KB) | High       | Low    | Treat the test rewrite as part of PR B's scope, not a separate task. Snapshot tests are out; behavior tests (click question 5 → scrolls; answer Q3 → grid cell shows "3:B") are in.                          |
| Mobile sheet drawer feels worse than expected on real devices                                 | Med        | Low    | Test on iOS Safari + Android Chrome before merging PR B. Fallback if it's bad: pin the navigation grid to the bottom of the question feed (no drawer). Document the choice in AGENTS.md regardless.          |
| Duplicating grading point values in `src/lib/grading-display.js` will drift from `worker/lib/grading.js` | Low        | Med    | Add a frontend test that pins the values to current constants and a comment in both files referencing each other.                                                                                            |
| Customers expecting Vietnamese copy (Shub is in Vietnamese) won't get it in v0.4.5            | Low        | Low    | Acknowledge in release notes; queue i18n RFC. Strings are isolated enough that swapping later is cheap.                                                                                                      |
| 150 % root font-size breaks layout on a page we forget to check                                 | High       | Med    | Visual-regression sweep is part of PR D's definition of done — specifically: login, register, both dashboards, exercises lists, take page (3 input modes), summary, review, both teacher exercise pages. If a page can't absorb the bump, fix the page (move from `px` → `rem`), don't roll back the global change. |
| Existing exercises pinned to dropped models (`google/gemini-2.5-flash`, `openai/gpt-4o-mini`) silently fall back without telling the teacher, **and the default also changes from Grok to Mistral**, so even pinned `null` rows behave differently | High        | Low    | Accepted: per Open Questions Q8 resolution, no in-product notification. Release notes call it out explicitly: "v0.4.5 changes the extraction default to Mistral. Exercises that previously used the server default (or were pinned to Gemini / GPT-4o-mini) now use Mistral. Re-pick Grok 4.1 Fast if preferred." Worker tests pin the new fallback target. |
| Dropzone primitive extraction breaks `AnswerImageUpload` from v0.4                              | Med        | Med    | Existing `answer-image-upload.test.jsx` (7.2 KB) is the regression net. PR D must keep all those tests green without modification. Refactor in small commits if needed.                                                                                                          |
| Mistral as default produces visibly different extraction quality than Grok                       | Med        | Med    | Pre-merge spot check: run 3–5 known answer-sheet images through both models and compare. If Mistral is materially worse, escalate before PR D merges (options: keep Grok default, or hold the trim entirely). Treat this as a go/no-go gate on PR D rather than a post-merge regret.                                                            |

---

## Resolved open questions

All 8 open questions raised in v1/v2 are resolved as of v3 (2026-05-03). Recorded for traceability:

| #   | Question                                                                                       | Resolution                                                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Should the grid show an "any-sub-answered" boolean as visually in-progress (third state)?      | **No** for v0.4.5. Two states only (answered / unanswered). A boolean question is "answered" iff all 4 sub-questions are answered. Reopen if dogfood feedback strongly asks for it post-PR B.                                                                              |
| 2   | Take-page PDF default on or off?                                                               | **On** for v0.4.5. Flip to off later, alongside the QR-code submission flow from the README queue (printed sheet replaces the on-screen PDF). Toolbar toggle works either way; this is just the initial value of `smartclass-take-pdf-visible`.                            |
| 3   | Per-exercise sidebar enable/disable for the teacher?                                           | **No toggle.** Whichever option is easier to implement = ship-with-no-toggle. The sidebar is always on for students. Teachers who want to disable it would need a real product reason; none has surfaced.                                                                  |
| 4   | Results summary page: replace the in-place echo or supplement it?                              | **Replace.** After submit, navigate to `/student/submissions/:id/summary`. If a student reloads `/student/exercises/:id` (the landing URL) after submit, the landing card shows a "Submitted" inline banner with a primary "View result" button (links to the summary).    |
| 5   | Ship deselect on numeric and boolean too?                                                      | **No need.** MCQ deselect ships in PR C; numeric and boolean keep their native clearing (delete the input / pick the opposite state). Reopen only if user research surfaces a specific complaint.                                                                          |
| 6   | Expandable per-question list — prototype now, promote later?                                   | **Skip entirely for v0.4.5.** Even the `?layout=list` prototype is dropped from PR B. v0.5 reopens this with a fresh design pass; nothing is built ahead of design.                                                                                                          |
| 7   | 150 % zoom and dense tables?                                                                   | **Reframe**: the customer's actual problem is page-margin whitespace eating useful area, not "things are too small". Ship 150 % root font-size in PR D; tune the exact number (130 % vs 150 %) inside that PR based on the regression sweep. Margins (`max-w-4xl px-8`) stay. |
| 8   | Should `GET /api/extract-models` notify the frontend of removed IDs?                           | **No.** Silent fallback is fine. **And the default itself changes from Grok to Mistral** in this RFC — so even non-stale `NULL` rows now resolve to a different model. Release notes mention it; no in-product banner.                                                       |

---

## Out of scope (explicit non-goals)

- **No new vision-LLM work** beyond trimming the allowlist. Extraction code paths, prompts, validator, and Gemini fallback all stay exactly as v0.4 shipped them.
- **No grading rule changes.** `worker/lib/grading.js` is untouched.
- **No new database migrations.** All new state is computed client-side from existing API responses.
- **No teacher-side layout overhaul.** Teacher pages keep their current layout; only the file-input dropzone affordance and the global zoom apply.
- **No accessibility audit pass.** A11y is on the roadmap (post-v0.6); this RFC adds ARIA labels for the new components but doesn't claim WCAG compliance.
- **No expandable-list layout (not even a prototype).** Reopens in v0.5 with a fresh design pass.
- **No in-product notification for the model default change.** Release-notes only.

---

## Appendix: AGENTS.md update preview

After merging, the **Design Decisions** section should gain:

> ### Take-Page Sidebar and Pre-Start Landing (v0.4.5)
>
> - **Routing**: `/student/exercises/:id` (landing) + `/student/exercises/:id/take` (take). Submission created on Start, not on landing mount. Reverses the v0.2 "create on mount" rule; timer accuracy preserved via `started_at`.
> - **Submitted state on landing**: if the student has already submitted this exercise, the landing card shows a "Submitted" banner with a "View result" button instead of the Start CTA. Detection uses `GET /api/submissions?exercise_id=X&limit=1`.
> - **Layout**: CSS grid `lg:grid-cols-[1fr_320px]` with sticky right sidebar. Mobile uses a Radix Sheet bottom drawer triggered by a floating "Answer Sheet" button.
> - **PDF default**: visible on first mount (`smartclass-take-pdf-visible` defaults to `true`). Toolbar toggle hides it. Default flips to off when the QR-code submission flow lands.
> - **Question navigation grid**: 5-column grid; cells show `n:LETTER` (mcq), `n:VALUE` truncated to 4 chars (numeric), `n:✓` (boolean if all 4 subs answered). Boolean is "answered" iff **all** subs are answered.
> - **Submit dialog**: dynamic message names exact unanswered count (boolean rule above).
> - **Skipped vs incorrect**: `submitted_answer === null` renders as grey `−`; wrong answer renders as red `✗`. Computed at render time, no DB change.
> - **Summary page**: `/student/submissions/:id/summary` after submit. Counters computed client-side from enriched `GET /api/submissions/:id` (no new endpoint).
> - **Review sidebar**: per-question table (status, q#, chosen, correct, pts). Click-to-scroll to question.
> - **Grading constants on the frontend**: `src/lib/grading-display.js` mirrors `worker/lib/grading.js` constants. Pinned by a frontend test.
> - **MCQ deselect only**: small `×` button on the selected MCQ row. Numeric/boolean keep their native clearing.
>
> ### File Upload Dropzone (v0.4.5)
>
> - **Shared primitive**: `src/components/file-dropzone.jsx` extracted from `AnswerImageUpload` (v0.4). Used by teacher exercise create/edit pages and student answer-image upload.
> - **Behavior**: drag, drop, or click-to-browse all hit the same `onFile` callback. Visual hover state on dragover. Backwards compatible — file dialog still works for users who never drag.
>
> ### Default 150 % Zoom (v0.4.5)
>
> - **Implementation**: `html { font-size: 150%; }` in `src/index.css`. Cascades through every Tailwind/shadcn `rem`/`em` value.
> - **Fixed-width override**: take-page sidebar uses `clamp(280px, 22rem, 360px)` instead of `320px` to absorb the bump.
> - **Rationale**: customer feedback — page margins (`max-w-4xl px-8`) leave too much unused area, especially on dense pages. Scaling the root font-size reclaims that space as readable type without touching the layout containers. Final percentage tunable inside PR D's regression sweep.
>
> ### Image-Extraction Model Allowlist (v0.4.5)
>
> - **Allowlist**: `mistralai/mistral-small-3.2-24b-instruct` (**default**), `x-ai/grok-4.1-fast`. Removed: `google/gemini-2.5-flash`, `openai/gpt-4o-mini`.
> - **Default change**: Grok → Mistral. `NULL` rows on `exercises.extract_model` and stale model IDs (Gemini, GPT-4o-mini) all now resolve to Mistral via `resolveModel()`.
> - **Migration**: none. `resolveModel()` silently falls back to default for unknown IDs (per "Server-side resolution"). No in-product notification — release notes only.
