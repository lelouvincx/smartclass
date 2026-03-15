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

- When learning hono docs, using tiny docs at https://hono.dev/llms-small.txt first; if still get errors, read full docs at https://hono.dev/llms-full.txt (note that the docs is very long, just read a part of it)
- Always follow test-driven development principles
- Use conventional commits for commit messages
- After creating a PR, update README part ROADMAP and AGENTS.md part Design Decisions if applicable

## Build Commands

- `npm run dev` – Start Vite dev server
- `npm run build` – Production build (`vite build`)
- No test runner or linter is configured.

## Architecture

- **Frontend**: React 19 SPA (Vite 6) deployed on Cloudflare Pages. React Router for navigation. Tailwind CSS 3, lucide-react icons. OCR via Tesseract.js (client-side).
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
- **Styling**: Tailwind utility classes via `className` string concatenation (no `clsx`/`cn`). Variant maps as plain objects inside components.
- **Formatting**: Single quotes for JS strings, 2-space indent, trailing commas.
- **Naming**: camelCase for variables/functions, PascalCase for components, UPPER_SNAKE_CASE for constants.

## Design Decisions

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
