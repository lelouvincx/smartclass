# Tech Debt & Low-Priority Issues

## From v0.2 Code Review (PRs #13–#18, reviewed in PR #19)

### Code Quality

- [ ] **Extract `optionalAuth` middleware** — `GET /api/exercises/:id` duplicates JWT parsing logic from `requireAuth`. Create a reusable `optionalAuth` middleware in `worker/middleware/auth.js` that attaches user to context if valid, but doesn't error if missing. (`worker/routes/exercises.js`)

- [ ] **Static import for `verifyAccessToken`** — `worker/routes/exercises.js` uses a dynamic `import()` for `verifyAccessToken` inside the request handler. Should be a top-level static import.

- [ ] **Consistent `token` argument ordering in API functions** — `getExercise(id, token)` vs `createSubmission(token, payload)`. Standardize on `token` as first argument for all authenticated calls. (`src/lib/api.js`)

### Frontend

- [x] **Extract `StudentLayout` component** — Extracted into `src/components/student-layout.jsx` with shared header, nav, logout, and mode toggle. Also created `src/components/teacher-layout.jsx`. Router uses nested `<Outlet />` for both roles.

### From README

- [ ] **Teacher seed SQL has hardcoded bcrypt hash**: `worker/db/seeds/0001_seed_teacher.sql` contains a pre-hashed password (`123`). Replace with a proper production secret management flow (e.g., generate hash at deploy time or use a CLI seed command with env var input).
- [x] **Validate styling framework**: Confirmed plain Tailwind CSS v3 (not shadcn/ui). Migrated to shadcn/ui v2 + Tailwind v4 in Phase 1 (see `docs/plans/2026-03-16-shadcn-ui-migration.md`).

### Backend

- [ ] Remove redundant google ai studio code because we are using openrouter well.

## From v0.2 — Teacher View/Edit Exercise (PR #30)

- [ ] **File upload in edit mode is deferred** — `TeacherViewExercisePage` edit mode only allows changing title, timing, and schema. Re-uploading or replacing exercise/solution PDFs is not yet possible from the edit page. Planned for a future iteration alongside a proper file management UI (list, delete, replace individual files).

## From v0.4.5 Code Review (PRs #56–#59)

### Frontend

- [ ] **Submitted-banner detection assumes ordering** — `StudentExerciseLandingPage.jsx` reads `submissions[0]` from `listMySubmissions(... limit: 1)` and treats it as the latest. Today this works because `worker/routes/submissions.js` orders by `submitted_at DESC`, but the assumption is implicit on the client. Add a comment or a sort-by-id-desc tiebreaker to future-proof it.

- [ ] **Review sidebar drops `correct` column vs RFC** — `submission-review-sidebar.jsx` renders `status | q# | chosen | pts` (4 columns); RFC `docs/plans/2026-05-03-exercise-experience-polish.md` specified `status | q# | chosen | correct | (points)` (5). Either re-add the column or update the RFC to reflect the deliberate trim.

- [ ] **Boolean "chosen" cell shows correctness rollup, not chosen answer** — `rowChosen()` in `submission-review-sidebar.jsx` returns `${correctCount}/4` for boolean rows, which is a score, not what the student picked. Re-label the column, or render a per-sub answer summary (e.g., `1010` for a/b/c/d).

- [ ] **No drift test for `src/lib/grading-display.js`** — RFC promised "a frontend test pinned to specific values catches it [if the worker constants ever drift]". Add a 4-line vitest assertion: `MCQ_POINTS === 0.25`, `NUMERIC_POINTS === 0.5`, `BOOLEAN_SCORE_TABLE[3] === 0.5`, etc.

- [ ] **`formatTimeTaken` duplicated** — Identical implementation lives in `src/pages/StudentSummaryPage.jsx` and `src/components/submission-review-sidebar.jsx`. Extract to `src/lib/format-time.js`.

- [ ] **Take-page timer effect has a boolean dep array** — `StudentTakeExercisePage.jsx` countdown `useEffect` uses `[secondsLeft === null]` plus an `eslint-disable`. Brittle and silently fails to restart if `secondsLeft` toggles back to non-null. Tighten the deps when the take page is next refactored.

## From shadcn/ui Migration (Phase 1)

- [ ] **Migrate from JavaScript to TypeScript** — Add `tsconfig.json`, rename `.jsx` to `.tsx`, add type annotations. Consider incremental adoption (strict mode off initially).
- [x] **Migrate remaining pages to shadcn/ui components** — All 9 pages fully migrated (Phase 3). All inline Tailwind classes replaced with shadcn/ui components. See `docs/plans/2026-03-16-shadcn-ui-migration.md`.
