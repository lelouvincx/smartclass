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

## From shadcn/ui Migration (Phase 1)

- [ ] **Migrate from JavaScript to TypeScript** — Add `tsconfig.json`, rename `.jsx` to `.tsx`, add type annotations. Consider incremental adoption (strict mode off initially).
- [ ] **Migrate remaining pages to shadcn/ui components** — Dashboard and list pages migrated (Phase 2). Complex pages (TeacherCreateExercisePage, TeacherViewExercisePage, StudentTakeExercisePage, LoginPage, RegisterPage) still use inline Tailwind classes. See Phase 3 migration plan in `docs/plans/2026-03-16-shadcn-ui-migration.md`.
