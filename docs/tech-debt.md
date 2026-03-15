# Tech Debt & Low-Priority Issues

## From v0.2 Code Review (PRs #13–#18, reviewed in PR #19)

### Code Quality

- [ ] **Extract `optionalAuth` middleware** — `GET /api/exercises/:id` duplicates JWT parsing logic from `requireAuth`. Create a reusable `optionalAuth` middleware in `worker/middleware/auth.js` that attaches user to context if valid, but doesn't error if missing. (`worker/routes/exercises.js`)

- [ ] **Static import for `verifyAccessToken`** — `worker/routes/exercises.js` uses a dynamic `import()` for `verifyAccessToken` inside the request handler. Should be a top-level static import.

- [ ] **Consistent `token` argument ordering in API functions** — `getExercise(id, token)` vs `createSubmission(token, payload)`. Standardize on `token` as first argument for all authenticated calls. (`src/lib/api.js`)

### Frontend

- [ ] **Extract `StudentLayout` component** — Header/logout logic is duplicated between `StudentDashboardPage` and `StudentExercisesPage`. Extract a shared layout wrapper.

### From README

- [ ] **Teacher seed SQL has hardcoded bcrypt hash**: `worker/db/seeds/0001_seed_teacher.sql` contains a pre-hashed password (`123`). Replace with a proper production secret management flow (e.g., generate hash at deploy time or use a CLI seed command with env var input).
- [ ] **Validate styling framework**: Confirm if the current styling setup is shadcn/ui or not.

### Backend

- [ ] Remove redundant google ai studio code because we are using openrouter well.
