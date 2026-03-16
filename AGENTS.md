# SmartClass: Assessment Platform

## Product Domain

- Three roles: **Teacher**, **Student**, and **Guest**.
- **Teacher** (admin): uploads exercises (PDF) with answer schemas, manages lecture pages (e.g., naming chapters, adding solution videos). The admin panel must be fully UI-editable and intuitive for non-technical users (no code or CLI required).
- **Student**: takes exercises (timed or untimed mode), submits answers via manual form, scanner mode (OCR), or image upload, receives automatic grading, saves results for later review, views solutions, and watches lecture videos.
- **Guest**: same as Student (completes exercises, watches videos) but without saving results.
- Answer types: multiple choice (A/B/C/D), true/false, or numeric fill-in.
- Grading is automated: OCR/scanner extracts answers from standardized sheets, then a simple matching logic compares against the schema.
- **Lectures**: Teachers upload YouTube video lectures and organize them into named sections (e.g., Chapter 1, Chapter 2, Solution for Exercise X). Students can browse and view lectures.

## Rules

- Create pull requests using bot token for all changes, even small ones
- When learning hono docs, using tiny docs at https://hono.dev/llms-small.txt first; if still get errors, read full docs at https://hono.dev/llms-full.txt (note that the docs is very long, just read a part of it)
- Always follow test-driven development principles
- Use conventional commits for commit messages
- After creating a PR, update README part ROADMAP and AGENTS.md part Design Decisions if applicable
- When creating a new DB migration, also update `docs/schema.dbml` to reflect the new state

## Build Commands

- `npm run dev` – Start Vite dev server
- `npm run build` – Production build (`vite build`)
- No test runner or linter is configured.

## Architecture

- **Frontend**: React 19 SPA (Vite 6) deployed on Cloudflare Pages. React Router for navigation. shadcn/ui (Radix + Tailwind CSS v4), lucide-react icons. OCR via Tesseract.js (client-side).
- **Backend**: Cloudflare Workers with Hono router. REST API (`/api/*`). JWT auth (bcryptjs).
- **Database**: Cloudflare D1 (SQLite). Tables: `users`, `exercises`, `answer_schemas`, `submissions`, `submission_answers`, `lectures`.
- **Storage**: Cloudflare R2 for PDFs and uploaded images. Client uploads via presigned URLs.
- **Auth**: Phone number (`+84xxx`) + password. Teacher creates students (default pw `123`) or student self-registers (pending approval). Guest = no login, data in IndexedDB.
- **Project structure**: `src/` (frontend), `worker/` (backend API), `wrangler.toml` (Cloudflare config).
- **Design doc**: `docs/plans/2026-03-08-architecture-design.md`.

## Code Style

- **Files**: `.jsx` extension, ES modules (`"type": "module"`).
- **Components**: Function components with `React.forwardRef` for primitives; named exports for primitives, default export for `App`.
- **State**: React hooks (`useState`, `useEffect`, `useRef`, `useCallback`). No external state library.
- **Styling**: shadcn/ui components + Tailwind utility classes via `cn()` from `@/lib/utils`. Use `@/` path alias for imports (e.g., `import { Button } from '@/components/ui/button'`). Add new shadcn/ui components via CLI: `npx shadcn@latest add <component>`. Legacy pages still use inline className string concatenation (migration in progress).
- **Formatting**: Single quotes for JS strings, 2-space indent, trailing commas.
- **Naming**: camelCase for variables/functions, PascalCase for components, UPPER_SNAKE_CASE for constants.

## Testing

- **Frontend**: Vitest + `@testing-library/react` + `jsdom`. Tests in `*.test.jsx` alongside components.
- **Backend**: Vitest + `@cloudflare/vitest-pool-workers` for integration tests against real D1. Config: `vitest.worker.config.js`. Tests in `*.integration.test.js`.
- **Run frontend tests**: `npx vitest run src/`
- **Run backend tests**: `npx vitest run --config vitest.worker.config.js`
- **Mocking**: `vi.mock` for `auth-context` and `api.js` in frontend tests. Use `seedTeacher`/`seedStudent`/`loginAsTeacher`/`loginAsStudent` helpers from `worker/test/helpers.js` for backend tests.

## API Conventions

- **Response shape**: `{ success: boolean, data: any, error: { code: string, message: string } }`
- **Helpers**: `jsonError(c, status, code, message)` and `jsonSuccess(c, data)` from `worker/lib/response.js`
- **Auth headers**: `Authorization: Bearer <jwt>`. Use `authHeaders(token, extra)` from `src/lib/api.js`.
- **Centralized fetch**: All API calls go through `request(path, options)` in `src/lib/api.js` which handles base URL, JSON parsing, and error propagation.

## Cloudflare Workers Gotchas

- **Environment bindings**: `JWT_SECRET` and other secrets must be in `.dev.vars` for local dev. Standard shell env vars are **not** available in the Worker `c.env` context.
- **D1 migrations**: Must be manually applied via `wrangler d1 execute` to both local and remote. They are **not** auto-applied by `wrangler dev`.
- **D1 atomicity**: Use `c.env.DB.batch([...statements])` for multi-statement transactions. Individual `.run()` calls are **not** atomic together.

## Design Decisions

### Timed vs. Untimed Exercises (v0.2)

- **Derived state**: `is_timed` is not a DB column. It is derived from `duration_minutes > 0`.
- **Normalization**: Backend forces `duration_minutes = 0` when `is_timed: false`.
- **API consistency**: `toExerciseWithTiming` helper in `worker/routes/exercises.js` ensures all responses include `is_timed` (0 or 1 for SQLite).

### Answer Security: Conditional Stripping (v0.2)

- **Endpoint**: `GET /api/exercises/:id` uses optional auth (not `requireAuth`)
- **Behavior**: If valid JWT with `role: 'teacher'` → full schema with `correct_answer`. Otherwise → `correct_answer` stripped.
- **Rationale**: Single endpoint, prevents students from inspecting network tab for answers.

### Submission Integrity (v0.2, PR #19)

- **Session persistence**: Frontend stores active `submission.id` in `sessionStorage` keyed by exercise ID. On page refresh, reuses the existing submission instead of creating a new one.
- **Timer accuracy**: Remaining time calculated from `started_at` timestamp, not `duration_minutes`. Prevents timer reset exploit on refresh.
- **Double-submit guard**: Backend uses `UPDATE ... WHERE submitted_at IS NULL` + row-count check for atomic protection. Frontend early check is a fast path only.
- **Answer validation**: Backend validates `q_id` range (1–`total_questions`) and rejects duplicate `q_id`s with 400.
- **Navigation guard**: `beforeunload` + `popstate` listener to catch both tab close and SPA back-button navigation.

### Answer Normalization (v0.2)

- `mcq`: uppercase A/B/C/D
- `boolean`: lowercase strings `true`/`false`
- `numeric`: trimmed strings
- `is_correct`: set by auto-grading immediately after submission (0 or 1)

### Exercise Permissions (v0.2)

- **Current**: All exercises are public (readable by anyone without authentication)
- **Future (v0.3+)**: Add granular permissions:
  - `is_public` flag per exercise
  - `guest_allowed` flag per exercise
  - `exercise_permissions` table for per-student access control
- **Rationale**: Ship core functionality faster; add access control when needed

### Upload Endpoints (v0.2)

- **Teacher uploads**: `POST /api/exercises/:id/files/upload`
  - Auth: Teacher only
  - Purpose: Exercise PDFs, solution PDFs, reference images
  - R2 path: `exercises/{exercise_id}/{timestamp}-{filename}`
  - Storage: `exercise_files` table
  - File types: `exercise_pdf`, `solution_pdf`, `reference_image`
- **Student uploads**: `POST /api/submissions/:id/upload` (future - PR3)
  - Auth: Student only (must own submission)
  - Purpose: Scanned answer sheets for OCR processing
  - R2 path: `submissions/{submission_id}/{timestamp}-{filename}`
  - File types: Images (jpg, png, pdf)
- **Rationale**: Separate endpoints enforce clear permission boundaries and organize R2 storage by content type

### Answer Schema Storage (v0.2)

- **Storage**: Separate `answer_schemas` table (normalized, one row per question)
- **Format**: API accepts array of objects: `[{"q_id": 1, "type": "mcq", "correct_answer": "B"}, ...]`
- **Alternative considered**: JSON column in `exercises` table
- **Rationale**: Proper normalization allows querying individual questions, easier to extend with metadata (explanations, points), database enforces constraints

### File Upload Validation (v0.2)

- **Current**: Trust `file_type` parameter, no file size limits
- **Future**: Add file extension validation, size limits (e.g., 10MB for images, 50MB for PDFs)
- **Rationale**: Simplify initial implementation; add stricter validation when abuse becomes a concern

### Student Exercise Browsing (v0.2)

- **UI Pattern**: Table layout (not card grid)
  - Columns: Title, Duration, Questions, Actions
  - Mobile-responsive with horizontal scroll
  - Alternative considered: Card grid for better mobile UX
  - **Rationale**: Consistent with TeacherExercisesPage; easier to scan multiple exercises; simpler implementation
- **Timed/Untimed Display**: Badge in Duration column
  - Timed: Blue badge "Timed" + duration in minutes
  - Untimed: Gray badge "Untimed" only (no duration shown)
  - **Rationale**: Visual distinction helps students choose appropriate exercises; avoids confusing "0 min" display
- **Empty State**: Encouraging message "No exercises yet. Check back soon!"
  - Alternative considered: Generic "No exercises available"
  - **Rationale**: Friendlier tone encourages return visits; reduces friction for new users
- **Navigation Flow**: `/student` → `/student/exercises` → `/student/exercises/:id`
  - Dashboard has "Quick Actions" section with exercise link
  - "Start" button navigates to exercise detail (placeholder page in v0.2)
  - **Rationale**: Clear information architecture; breadcrumb-style navigation; placeholder allows incremental feature completion
- **Exercise Metadata Display**: Minimal (no timestamps)
  - Show: title, duration, question count only
  - Hide: created_at, updated_at, description (if available)
  - **Rationale**: Keep interface simple; focus on actionable info; avoid information overload for students

### Student Exercise Taking (v0.2)

- **Submission lifecycle**: `POST /api/submissions` on page mount → `PUT /api/submissions/:id/submit` on confirm
  - Submission created immediately when student lands on the page; no "Start" confirmation step
  - **Rationale**: Simplest flow; timer accuracy requires `started_at` to be recorded as early as possible
- **No auto-submit on timer expiry**: When a timed exercise runs out of time, show an "Over time" warning and count up, but allow the student to submit manually at any point
  - **Alternative considered**: Auto-submit when timer hits zero
  - **Rationale**: Auto-submit can lose partially filled answers due to race conditions; student agency is preferred
- **Post-submit display**: Read-only echo of submitted answers (question, type, answer), no score or correctness shown
  - **Rationale**: Grading is a separate future feature (v0.3+); avoid showing partial/incorrect data
- **Unanswered questions**: Sent as `null` in the payload; displayed as `—` in the post-submit view
  - **Rationale**: Explicit `null` distinguishes "skipped" from "answered empty"; consistent with DB schema (`submitted_answer` nullable)
- **Navigation guard**: `beforeunload` browser warning + in-page "Back" link replaced with a warning prompt when an exercise is in progress (not yet submitted)
  - **Rationale**: Prevents accidental data loss; students can always choose to leave if they understand the consequence

### Boolean Sub-Questions Design (v0.2)

- **Format**: Each boolean ("Đúng/Sai") question has exactly 4 sub-questions (a, b, c, d), each with an independent correct answer of `'0'` (false) or `'1'` (true).
- **DB storage**: `answer_schemas` table has a nullable `sub_id TEXT` column. MCQ/numeric rows have `sub_id = NULL`; boolean rows have `sub_id IN ('a','b','c','d')`. Uniqueness is enforced by a `COALESCE` unique index: `CREATE UNIQUE INDEX idx_answer_schemas_unique ON answer_schemas(exercise_id, q_id, COALESCE(sub_id, ''))`.
- **Same pattern for submissions**: `submission_answers` has the same `sub_id` column and unique index to store per-sub-question student answers.
- **`total_questions` counts distinct `q_id` values** (`COUNT(DISTINCT q_id)`), not row count. A boolean question with 4 sub-rows still counts as 1 question.
- **API payload** for boolean questions:
  ```json
  [
    { "q_id": 2, "type": "boolean", "sub_id": "a", "correct_answer": "1" },
    { "q_id": 2, "type": "boolean", "sub_id": "b", "correct_answer": "0" },
    { "q_id": 2, "type": "boolean", "sub_id": "c", "correct_answer": "0" },
    { "q_id": 2, "type": "boolean", "sub_id": "d", "correct_answer": "1" }
  ]
  ```
- **Scoring formula** (future, v0.3+): non-linear partial credit per boolean question:
  - 0 sub-questions correct → 0 points
  - 1 correct → 0.1 points
  - 2 correct → 0.25 points
  - 3 correct → 0.5 points
  - 4 correct → 1.0 point
- **Teacher UI**: Boolean rows expand into 4 sub-rows (a,b,c,d) in the schema table, each with True/False radio toggles. Changing type to/from boolean auto-creates/collapses sub-rows.
- **Student UI**: Boolean questions render as a grouped card showing 4 sub-question rows, each with True/False radio buttons. Submit payload includes `sub_id` per sub-answer.
- **Alternative considered**: Encoding as `"0101"` string in a single `correct_answer` column — rejected because it would make adding per-sub-question explanations, scoring, or metadata very difficult without a schema change.
- **Rationale**: Treating each sub-question as a first-class DB row allows future columns (`explanation`, `points`, `image_url`) to be added trivially without migration pain.

### Auto-Grading (v0.2)

- **Trigger**: Runs synchronously inside `PUT /api/submissions/:id/submit`, immediately after answers are inserted.
- **Implementation**: `worker/lib/grading.js` — pure function `gradeSubmission(schema, answers)`, no DB access. See `docs/plans/2026-03-16-grading-logic.md` for the full design doc.
- **MCQ**: exact string match (`submitted === correct`), both normalized to uppercase A/B/C/D. **0.25 pts** if correct.
- **Numeric**: numeric equality within tolerance `|Number(s) - Number(c)| < 0.01` — handles `42.0 === 42` and similar rounding. **0.5 pts** if correct.
- **Boolean**: per-sub-question `is_correct`, then non-linear partial credit: `{0:0, 1:0.1, 2:0.25, 3:0.5, 4:1.0}` points per question (max **1.0 pt**).
- **Score formula**: `round((earned_points / max_possible_points) * 10, 2)` where `max_possible_points = sum of per-type max pts per distinct q_id` → stored on `submissions.score` on a 0–10 scale.
- **Skipped answers (null)**: always `is_correct = 0`.
- **Adjustable**: `MCQ_POINTS`, `NUMERIC_POINTS`, `BOOLEAN_SCORE_TABLE`, and `NUMERIC_TOLERANCE` constants in `grading.js` control the weights, curve, and tolerance.
- **Student UI**: Score shown immediately after submit (`X / 10`), with ✓/✗ per answer row.

### Submission Answer Validation (v0.2, PR #35)

- **Schema-based validation**: Answer `q_id` and `sub_id` are validated against actual schema keys from `answer_schemas`, not `total_questions` count. This allows non-contiguous q_ids (e.g., 1, 3, 5).
- **Previous bug**: Used `q_id <= total_questions` which rejected valid answers when schemas had gaps in q_id numbering.

### Cascade Deletes (v0.2, PR #35)

- **`submissions`**: `ON DELETE CASCADE` from `exercises(id)` — deleting an exercise cascades to all submissions.
- **`submission_answers`**: `ON DELETE CASCADE` from `submissions(id)` — deleting a submission cascades to all answers.
- **Migration 0006**: Uses `PRAGMA defer_foreign_keys` (D1-correct) instead of `PRAGMA foreign_keys = OFF`.
- **Previous bug**: Only `answer_schemas` had cascade; `submissions` and `submission_answers` did not, causing FK constraint errors when deleting exercises with submissions.

### Exercise Write Atomicity (v0.2, PR #35)

- **Update path**: Metadata update + schema replacement combined into single `DB.batch()` call.
- **Create path**: If schema batch insert fails, compensating `DELETE` removes the orphan exercise row.
- **Previous bug**: Separate DB calls could leave partial state on failure.

### Styling Framework Migration (v0.2)

- **Before**: Plain Tailwind CSS v3 with inline utility classes, zero reusable UI components, no dark mode.
- **After**: shadcn/ui v2 (Radix Nova preset) + Tailwind CSS v4 + dark mode (light/dark/system).
- **Language**: JavaScript (`tsx: false` in `components.json`). TypeScript migration deferred as tech debt.
- **Theming**: CSS variables (oklch color space) in `src/index.css`. Light and dark themes defined via `:root` and `.dark` selectors. `@custom-variant dark` for class-based toggling.
- **ThemeProvider**: `src/components/theme-provider.jsx` wraps app in `src/main.jsx`. Persists to `localStorage` key `smartclass-theme`.
- **Path aliases**: `@/` maps to `./src/` via `jsconfig.json` + `vite.config.js` resolve alias.
- **Utilities**: `cn()` from `src/lib/utils.js` (clsx + tailwind-merge) for className composition.
- **Migration approach**: Incremental — infrastructure in Phase 1, core components in Phase 2, page-by-page in Phase 3+.
- **RFC**: `docs/plans/2026-03-16-shadcn-ui-migration.md`.
