# SmartClass: Assessment Platform

## Product Domain

- Three roles: **Teacher**, **Student**, and **Guest**.
- **Teacher** (admin): uploads exercises (PDF) with answer schemas, manages lecture pages (e.g., naming chapters, adding solution videos). The admin panel must be fully UI-editable and intuitive for non-technical users (no code or CLI required).
- **Student**: takes exercises (timed or untimed mode), submits answers via manual form, scanner mode (OCR), or image upload, receives automatic grading, saves results for later review, views solutions, and watches lecture videos.
- **Guest**: same as Student (completes exercises, watches videos) but without saving results.
- Answer types: multiple choice (A/B/C/D), true/false, or numeric fill-in.
- Grading is automated: OCR/scanner extracts answers from standardized sheets, then a simple matching logic compares against the schema.
- **Lectures**: Teachers upload YouTube video lectures and organize them into named sections (e.g., Chapter 1, Chapter 2, Solution for Exercise X). Students can browse and view lectures.

## Build Commands

- `npm run dev` – Start Vite dev server
- `npm run build` – Production build (`vite build`)
- `npm run preview` – Preview production build
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

## References

- Learning hono docs, using tiny docs at https://hono.dev/llms-small.txt first; if still get errors, read full docs at https://hono.dev/llms-full.txt (note that the docs is very long, just read a part of it)
- Always follow test-driven development principles
