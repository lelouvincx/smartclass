# RFC: v0.3 — Student Review

**Date:** 2026-03-16
**Status:** Shipped
**Author:** lelouvincx + Claude Code

### Revision History

| Rev | Date | Changes |
|-----|------|---------|
| v1 | 2026-03-16 | Initial draft |
| v2 | 2026-03-16 | Address review: tiered file auth (HIGH), schema-first left join (MED), list pagination (MED), security tests (MED), R2 Content-Type metadata (LOW) |
| v3 | 2026-03-16 | Shipped — all 7 PRs merged (#42–#49). PDF split changed from 50/50 to 60/40 after UI feedback. |

---

## Motivation

After v0.2, students can take exercises and see their score immediately after submission. However:

- **No PDF during exercise**: Students must open the exercise PDF separately (print or another tab). The uploaded PDFs exist in R2 but **cannot be retrieved** — there is no file download/serve endpoint.
- **No review after the fact**: Once a student leaves the post-submit page, they cannot revisit their graded answers or see what the correct answers were.
- **No submission history**: There is no way to list past submissions. Students cannot track their progress over time.

These three gaps make the platform feel incomplete. v0.3 closes them.

---

## Scope (from roadmap)

1. **Student: view PDF in split-pane during exercise**
2. **Review mode: student reviews graded submissions with correct answers shown**
3. **Submission history: student views past submissions**

---

## Current State

| What | Status |
|------|--------|
| Exercise PDFs uploaded to R2 | Yes (`exercise_files` table, `BUCKET.put()`) |
| File download/serve endpoint | **Missing** — no `BUCKET.get()` route |
| `GET /api/submissions/:id` | Returns answers with `is_correct` but **no `correct_answer`** |
| List submissions endpoint | **Missing** — no `GET /api/submissions` |
| Submission history page | **Missing** — no route, no component |
| Review page | **Missing** — no route, no component |
| `pdfjs-dist` | Installed, used for text extraction only (`src/lib/pdf.js`) |
| Student nav links | Dashboard, Exercises only — no History |

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| File serving | **Worker proxy** (`BUCKET.get()` streamed through Worker) | Consistent with existing upload pattern (Worker proxy via `BUCKET.put()`). Avoids adding `@aws-sdk` deps and R2 API credentials for presigned URLs. Acceptable overhead for PDFs. |
| File access control | **Tiered by file_type** (`exercise_pdf` = public, others = teacher-only) | Prevents leaking `solution_pdf` and `reference_image` to students. Uses optional auth pattern already in codebase. |
| File Content-Type | **R2 metadata first**, extension fallback | Upload already stores `contentType` in R2 `httpMetadata`. More reliable than filename-based derivation. |
| PDF display | **`<iframe src={url}>`** | Browser's native PDF viewer — zero JS bundle cost, supports zoom/scroll/print. No need for `react-pdf` complexity. |
| Review page | **Separate page** (`StudentReviewPage.jsx`) | `StudentTakeExercisePage.jsx` is already 697 lines with complex timer/navigation-guard logic. A review page has a fundamentally different data flow (fetch existing submission vs. create new one). Shared display components are extracted into reusable modules. |
| Review query direction | **Schema-first left join** (`answer_schemas LEFT JOIN submission_answers`) | Guarantees all schema questions appear in review even if `submission_answers` has missing rows (legacy data, partial payloads). Skipped questions show as `null` / "—". |
| Correct answer visibility | **Show all correct answers** in review mode | Full transparency after submission is locked. Correct answers are already implicitly derivable from `is_correct` for MCQ/boolean (small option space). No security risk post-submit. |
| Correct answer for unsubmitted | **Excluded** (stripped from response) | In-progress attempts must not expose the answer key. Same security pattern as `GET /api/exercises/:id` for non-teachers. |
| List submissions pagination | **Server-side `limit`/`offset`** | Dashboard needs only 3 rows; avoids fetching full history on every visit. Default limit=50, max=100. |
| DB migrations | **None** | All required tables exist (`exercise_files`, `submissions`, `submission_answers`, `answer_schemas`). v0.3 is backend endpoints + frontend pages only. |

---

## Design

### 1. File Serve Endpoint

**New route:** `GET /api/files/:fileId`

```
Client                     Worker                      R2
  |  GET /api/files/42       |                          |
  |─────────────────────────>|  SELECT r2_key, file_type|
  |                          |  FROM exercise_files     |
  |                          |  WHERE id = ?            |
  |                          |                          |
  |                          |  if file_type !=         |
  |                          |  'exercise_pdf':         |
  |                          |    check teacher JWT     |
  |                          |                          |
  |                          |  BUCKET.get(r2_key)      |
  |                          |<─────────────────────────|
  |  200 OK (streamed body)  |                          |
  |<─────────────────────────|                          |
```

- **Auth**: Tiered by `file_type`:

  | file_type | Access | Rationale |
  |-----------|--------|-----------|
  | `exercise_pdf` | **Public** (no auth) | Matches exercise browse being public; needed for guest mode (v0.6); embedded in iframe during exercise-taking |
  | `solution_pdf` | **Teacher only** (valid JWT with `role: 'teacher'`) | Solution content must not leak to students before/during exercise |
  | `reference_image` | **Teacher only** | Internal reference material for teachers |

  Implementation uses optional auth (same pattern as `GET /api/exercises/:id` in `worker/routes/exercises.js:126-138`): parse JWT if present, check role. If `file_type != 'exercise_pdf'` and requester is not a teacher → **403**.

- **Lookup**: Query `exercise_files` by `id` to get `r2_key`, `file_name`, and `file_type`
- **Content-Type**: Primary source is `r2Object.httpMetadata?.contentType` (already stored at upload time by `BUCKET.put()` in `worker/routes/upload.js:101-103`). Falls back to extension-based derivation (`.pdf` → `application/pdf`, `.png` → `image/png`) only if R2 metadata is missing.
- **Headers**: `Content-Disposition: inline` (display in browser, not force download)
- **Caching**: `Cache-Control: public, max-age=3600` (files are immutable once uploaded)
- **Errors**: 404 if file record or R2 object not found; 403 if non-public `file_type` without teacher auth
- **File**: `worker/routes/files.js`, mounted at `/api/files` in `worker/index.js`

**Note on file metadata exposure**: `GET /api/exercises/:id` currently returns all file metadata (including `solution_pdf` entries with their IDs) publicly at `exercises.js:117-119`. This means file IDs for non-public types are discoverable, but the serve endpoint blocks non-teachers from fetching the actual content. Stripping non-public file metadata from the public exercise response is deferred as a follow-up cleanup (not blocking for v0.3).

### 2. Split-Pane PDF Viewer

**New component:** `src/components/pdf-split-pane.jsx`

```
┌─────────────────────────────────────────────────┐
│  Desktop (≥1024px)                              │
│ ┌──────────────┐  ┌──────────────────────────┐  │
│ │              │  │                          │  │
│ │   PDF        │  │   Answer Form            │  │
│ │  (iframe)    │  │   (children)             │  │
│ │              │  │                          │  │
│ │              │  │                          │  │
│ └──────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────┘

┌─────────────────────────┐
│  Mobile (<1024px)       │
│ ┌─────────────────────┐ │
│ │ [Show/Hide PDF] ▼   │ │
│ │ ┌─────────────────┐ │ │
│ │ │   PDF (iframe)  │ │ │  ← collapsible
│ │ └─────────────────┘ │ │
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │   Answer Form       │ │
│ │   (children)        │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

**Props:**
- `fileUrl: string | null` — URL to the PDF file (`/api/files/:id`). If `null`, renders children only (no split pane).
- `children: ReactNode` — The answer form or review content (right pane).

**Behavior:**
- Desktop: CSS grid `lg:grid-cols-2` with the PDF on the left, children on the right
- Mobile: PDF in a collapsible `<details>`/button section at the top
- Toggle state persisted to `localStorage` key `smartclass-pdf-pane-collapsed`
- PDF iframe has `width: 100%; height: 100%` with sticky positioning so it stays in view while scrolling answers
- If `fileUrl` is null (no PDF uploaded), component renders `{children}` only — no layout change

**Used in:**
- `StudentTakeExercisePage.jsx` — wraps the answer form
- `StudentReviewPage.jsx` — wraps the review content

### 3. List Submissions Endpoint

**New route:** `GET /api/submissions` (added to existing `worker/routes/submissions.js`)

```sql
select
    s.id
    , s.exercise_id
    , e.title as exercise_title
    , s.mode
    , s.score
    , s.total_questions
    , s.started_at
    , s.submitted_at
from submissions s
    join exercises e on e.id = s.exercise_id
where s.user_id = ?
    and s.submitted_at is not null
order by s.submitted_at desc
limit ? offset ?
```

- **Auth**: `requireAuth` — returns only the authenticated student's submissions. Cross-user isolation enforced (Student A cannot see Student B's submissions).
- **Filter**: Optional `?exercise_id=X` query param to filter by exercise
- **Pagination**: Optional `?limit=N&offset=M` query params
  - `limit`: max rows to return (default: 50, max: 100). Dashboard passes `limit=3`.
  - `offset`: rows to skip (default: 0). For future pagination on the history page.
  - Both validated as non-negative integers; `limit` capped at 100.
- **Excludes**: In-progress submissions (`submitted_at IS NULL`) — these are abandoned/ongoing attempts
- **Response shape**: `{ success: true, data: { submissions: [...], total: N } }` — array of submission summaries (no answers, no schema) plus total count for pagination UI. Total count query:
  ```sql
  select count(*) as total
  from submissions
  where user_id = ? and submitted_at is not null
  ```

**New API client function** (`src/lib/api.js`):
```js
export function listMySubmissions(token, { exerciseId, limit, offset } = {}) { ... }
```

Dashboard calls `listMySubmissions(token, { limit: 3 })` — fetches exactly 3 rows, not the full history.

### 4. Submission Review Endpoint (Enhanced GET)

**Modified route:** `GET /api/submissions/:id` (existing in `worker/routes/submissions.js`)

Current response per answer:
```json
{ "q_id": 1, "sub_id": null, "submitted_answer": "B", "is_correct": 0 }
```

**New response** per answer (when submission is completed):
```json
{
  "q_id": 1,
  "sub_id": null,
  "type": "mcq",
  "submitted_answer": "B",
  "correct_answer": "A",
  "is_correct": 0
}
```

**Implementation**: Use `answer_schemas` as the base table and LEFT JOIN `submission_answers` onto it. This guarantees every schema question appears in the response, even if `submission_answers` has missing rows (legacy data, partial client payload, or entirely skipped questions):

```sql
select
    a.q_id
    , a.sub_id
    , a.type
    , a.correct_answer
    , sa.submitted_answer
    , coalesce(sa.is_correct, 0) as is_correct
from answer_schemas a
    left join submission_answers sa
        on sa.submission_id = ?
        and sa.q_id = a.q_id
        and coalesce(sa.sub_id, '') = coalesce(a.sub_id, '')
where a.exercise_id = ?
order by a.q_id asc, a.sub_id asc
```

Questions with no matching `submission_answers` row will have `submitted_answer = null` and `is_correct = 0`, rendered as "—" (skipped) in the review UI.

**Important**: `correct_answer` is only included when `submitted_at IS NOT NULL` (submission already locked). For in-progress (unsubmitted) attempts, the query strips `correct_answer` from the response (same security pattern as `GET /api/exercises/:id` for non-teachers).

Also include `exercise_title` and `exercise_files` in the response so the review page has everything in one fetch:

```json
{
  "id": 5,
  "exercise_id": 2,
  "exercise_title": "Đề thi HK1 Toán 10",
  "score": 7.5,
  "total_questions": 20,
  "started_at": "2026-03-16T10:00:00Z",
  "submitted_at": "2026-03-16T10:25:00Z",
  "files": [
    { "id": 3, "file_type": "exercise_pdf", "file_name": "de-thi.pdf" }
  ],
  "answers": [
    { "q_id": 1, "sub_id": null, "type": "mcq", "submitted_answer": "B", "correct_answer": "A", "is_correct": 0 },
    { "q_id": 2, "sub_id": "a", "type": "boolean", "submitted_answer": "1", "correct_answer": "1", "is_correct": 1 },
    { "q_id": 3, "sub_id": null, "type": "numeric", "submitted_answer": null, "correct_answer": "42", "is_correct": 0 },
    ...
  ]
}
```

**Security considerations:**
- `correct_answer` is only included when `submitted_at IS NOT NULL` (submission already locked). Unsubmitted attempts return answers without `correct_answer`.
- The endpoint already enforces `user_id` ownership — only the submitting student can view their own submission (cross-user access returns 403).
- Correct answers are practically derivable from `is_correct` anyway for MCQ (4 options) and boolean (2 options).

### 5. Submission History Page

**New page:** `src/pages/StudentSubmissionsPage.jsx`
**Route:** `/student/submissions`

**UI:**

```
┌──────────────────────────────────────────────┐
│  Submission History                          │
│                                              │
│  ┌──────────────────────────────────────────┐│
│  │ Exercise Title  │ Score │ Date   │ Action││
│  ├──────────────────────────────────────────┤│
│  │ Đề thi HK1     │ 7.50  │ 2h ago │ Review││
│  │ Bài tập Ch.3   │ 4.29  │ Mar 15 │ Review││
│  │ Kiểm tra 15p   │ 9.00  │ Mar 14 │ Review││
│  └──────────────────────────────────────────┘│
│                                              │
│  Empty state:                                │
│  "No submissions yet. Start an exercise to   │
│   see your results here!"                    │
└──────────────────────────────────────────────┘
```

- **Score display**: `X.XX / 10`, color-coded badge:
  - Green (`≥ 7.0`): good performance
  - Yellow (`≥ 4.0`): needs improvement
  - Red (`< 4.0`): struggling
- **Date**: Relative time for recent ("2 hours ago"), absolute for older ("Mar 15")
- **Review button**: Navigates to `/student/submissions/:id/review`
- **Loading state**: Skeleton table rows
- **Error state**: Retry button

### 6. Review Mode Page

**New page:** `src/pages/StudentReviewPage.jsx`
**Route:** `/student/submissions/:id/review`

**UI (with split-pane PDF):**

```
┌───────────────────┬─────────────────────────────┐
│                   │  Đề thi HK1 Toán 10         │
│                   │  Score: 7.50 / 10            │
│    PDF Viewer     │  Submitted: 2h ago           │
│    (iframe)       │                              │
│                   │  ┌─────────────────────────┐ │
│                   │  │ Q1 (MCQ)            ✗   │ │
│                   │  │ Your answer: B           │ │
│                   │  │ Correct answer: A        │ │
│                   │  ├─────────────────────────┤ │
│                   │  │ Q2 (Boolean)        ✓✗✓✗│ │
│                   │  │ a) You: True  ✓ Ans: T  │ │
│                   │  │ b) You: True  ✗ Ans: F  │ │
│                   │  │ c) You: False ✓ Ans: F  │ │
│                   │  │ d) You: —     ✗ Ans: T  │ │
│                   │  ├─────────────────────────┤ │
│                   │  │ Q3 (Numeric)         ✓  │ │
│                   │  │ Your answer: 42          │ │
│                   │  │ Correct answer: 42       │ │
│                   │  └─────────────────────────┘ │
│                   │                              │
│                   │  Summary: 15/20 correct      │
│                   │  [Back to History]           │
└───────────────────┴─────────────────────────────┘
```

**Data flow:**
1. Fetch `getSubmission(token, id)` — returns submission with enriched answers (type, correct_answer) + exercise files
2. Find `exercise_pdf` from `files[]`, build URL `/api/files/${file.id}`
3. Render `<PdfSplitPane fileUrl={url}>` with review content as children
4. Group answers by `q_id` (same grouping logic as `StudentTakeExercisePage`)
5. Render each question as a read-only card with student answer, correct answer, and ✓/✗

**Per-question display:**
- **MCQ**: Show student's choice highlighted (green if correct, red if wrong) + correct answer always shown
- **Boolean**: 4 sub-rows, each with "Your answer" / "Correct answer" + ✓/✗ icon
- **Numeric**: Show student's number + correct number
- **Skipped (null)**: Show "—" for student answer, correct answer still shown

### 7. Shared Answer Display Components

**Extract from `StudentTakeExercisePage.jsx` into `src/components/answer-result.jsx`:**

Currently, `McqNumericResultRow` (line ~146) and `BooleanResultGroup` (line ~160) and `CorrectnessIcon` (line ~146) are defined inline in the take page. Extract and extend them:

```jsx
// src/components/answer-result.jsx

// Shows ✓ or ✗ icon
export function CorrectnessIcon({ isCorrect }) { ... }

// MCQ/Numeric result row — now also accepts `correctAnswer` prop
export function McqNumericResultRow({ question, answer, correctAnswer }) { ... }

// Boolean result group — now also accepts schema with correct answers
export function BooleanResultGroup({ group, submittedAnswers, schemaAnswers }) { ... }
```

Both `StudentTakeExercisePage` (post-submit view) and `StudentReviewPage` import from this shared module. The take page passes `correctAnswer={null}` (doesn't show correct answers immediately after submit — only score + ✓/✗). The review page passes the actual correct answers.

### 8. Navigation Updates

**Student Layout** (`src/components/student-layout.jsx`):
- Add "History" nav button → `/student/submissions`

**Student Dashboard** (`src/pages/StudentDashboardPage.jsx`):
- Add "Recent Submissions" card showing last 3 submissions with score and "Review" link
- Add "View All History" link to `/student/submissions`

**Navigation guard** (`src/lib/navigation.js`):
- Update `canAccessRolePath` to allow `/student/submissions*`

**Router** (`src/router.jsx`):
- Add: `<Route path="submissions" element={<StudentSubmissionsPage />} />`
- Add: `<Route path="submissions/:id/review" element={<StudentReviewPage />} />`

---

## PR Breakdown

| PR | Title | Type | Dependencies | Est. Size |
|----|-------|------|-------------|-----------|
| **A** | File serve endpoint | Backend | None | S |
| **B** | Split-pane PDF viewer during exercise | Frontend | PR-A | M |
| **C** | List submissions endpoint | Backend | None | S |
| **D** | Enrich submission GET with correct answers + exercise data | Backend | None | S |
| **E** | Submission history page | Frontend | PR-C | M |
| **F** | Review mode page + extract shared answer components | Frontend | PR-A, PR-D | L |
| **G** | Nav updates, dashboard polish, route wiring | Frontend | PR-E, PR-F | S |

**Execution order** (parallelism shown):

```
         PR-A (file serve) ──────────┐
                                     ├──> PR-B (PDF split-pane)
         PR-C (list submissions) ────┤
                                     ├──> PR-E (history page)
         PR-D (enrich GET) ──────────┤
                                     ├──> PR-F (review page)
                                     │
                                     └──> PR-G (nav + dashboard)
```

PR-A, PR-C, PR-D have no dependencies and can be done in parallel.

---

## Testing Strategy

### Backend (integration tests)

| Test | PR | Description |
|------|----|-------------|
| File serve: exercise_pdf public | A | Upload exercise_pdf → GET `/api/files/:id` without auth → 200, body matches |
| File serve: 404 unknown id | A | GET `/api/files/999` → 404 |
| File serve: R2 object missing | A | DB record exists but R2 object deleted → 404 |
| File serve: solution_pdf blocked without auth | A | Upload solution_pdf → GET `/api/files/:id` without token → 403 |
| File serve: solution_pdf blocked for student | A | GET `/api/files/:id` for solution_pdf with student JWT → 403 |
| File serve: solution_pdf allowed for teacher | A | GET `/api/files/:id` for solution_pdf with teacher JWT → 200 |
| File serve: reference_image blocked for student | A | GET `/api/files/:id` for reference_image with student JWT → 403 |
| List submissions: empty | C | New student → GET `/api/submissions` → empty array |
| List submissions: ordered | C | Submit 2 exercises → verify newest first |
| List submissions: excludes in-progress | C | Create submission without submitting → not in list |
| List submissions: exercise_id filter | C | Filter by exercise → only matching submissions |
| List submissions: limit param | C | Submit 3 → GET with `?limit=2` → 2 rows returned, total=3 |
| List submissions: cross-user isolation | C | Student A submits → Student B calls GET `/api/submissions` → empty (cannot see A's data) |
| GET submission: includes correct_answer | D | Submit → GET → verify `correct_answer` and `type` present per answer |
| GET submission: includes exercise data | D | Submit → GET → verify `exercise_title` and `files` present |
| GET submission: schema-first completeness | D | Submit with partial answers (skip some questions) → GET → all schema questions present, skipped ones have `submitted_answer: null` |
| GET submission: correct_answer excluded for unsubmitted | D | Create submission (no submit) → GET → response has no `correct_answer` field in answers |
| GET submission: cross-user 403 | D | Student A submits → Student B tries GET `/api/submissions/:id` → 403 |

### Frontend (unit tests)

| Test | PR | Description |
|------|----|-------------|
| PdfSplitPane: renders iframe | B | Pass `fileUrl` → iframe rendered with correct src |
| PdfSplitPane: no URL | B | Pass `null` → no iframe, children rendered directly |
| PdfSplitPane: toggle collapse | B | Click toggle → PDF hidden/shown |
| SubmissionsPage: renders table | E | Mock API → verify table rows |
| SubmissionsPage: empty state | E | Mock empty API → verify empty message |
| ReviewPage: shows correct answers | F | Mock submission → verify correct answers displayed |
| ReviewPage: shows PDF | F | Mock submission with files → verify iframe |
| CorrectnessIcon: correct/wrong | F | Verify green check / red cross |

---

## Files Changed

| File | Action | PR |
|------|--------|----|
| `worker/routes/files.js` | **New** | A |
| `worker/index.js` | Mount files route | A |
| `worker/routes/submissions.js` | Add GET list + enrich GET by ID | C, D |
| `src/lib/api.js` | Add `listMySubmissions`, `getFileUrl` helper | C, E |
| `src/components/pdf-split-pane.jsx` | **New** | B |
| `src/components/answer-result.jsx` | **New** (extracted from take page) | F |
| `src/pages/StudentTakeExercisePage.jsx` | Add PDF split-pane, refactor to use shared components | B, F |
| `src/pages/StudentSubmissionsPage.jsx` | **New** | E |
| `src/pages/StudentReviewPage.jsx` | **New** | F |
| `src/pages/StudentDashboardPage.jsx` | Add recent submissions card | G |
| `src/components/student-layout.jsx` | Add "History" nav link | G |
| `src/router.jsx` | Add submission routes + imports | E, F, G |
| `src/lib/navigation.js` | Allow `/student/submissions*` | G |
| `worker/routes/files.integration.test.js` | **New** | A |
| `worker/routes/submissions.integration.test.js` | Add list + enriched GET tests | C, D |

No new DB migrations. No changes to `docs/schema.dbml`.

---

## Open Questions

1. **File serve caching**: `Cache-Control: public, max-age=3600` (1 hour) is proposed. Should we use a longer TTL since exercise files are immutable once uploaded? (e.g., `max-age=86400` for 1 day, or even `immutable`)

2. **Post-submit redirect**: After submitting an exercise, the take page currently shows an inline results view. Should we redirect to the review page instead (so the student immediately sees the full review with correct answers + PDF)? Or keep the current inline view and let the student navigate to review separately?

---

## Out of Scope (v0.4+)

- Scanner / OCR / image upload submission mode
- Teacher viewing student submissions
- Solution PDF display (separate from exercise PDF)
- Guest mode (no auth, IndexedDB storage)
- Explanation field per answer (image/markdown)
- Exercise permissions (public/private/per-student)
