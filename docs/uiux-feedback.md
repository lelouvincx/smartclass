# UI/UX Feedback

## Open Issues

- [ ] **Support drag-and-drop for file upload** — File upload inputs should accept drag-and-drop in addition to the click-to-browse interaction, improving usability especially for teachers uploading PDFs.
- [x] Clicking 'refresh' button should show last refreshed time — "Updated HH:MM:SS" timestamp appears next to the refresh button on both TeacherExercisesPage and StudentExercisesPage after each successful load. Refresh icon spins while loading; button is disabled during fetch.
- [ ] Allow students to hide the timer because they can feel frustrated when they are taking the test and the timer is ticking. Just notify on certain time intervals (e.g. 30 mins left, 10 mins left) instead of showing a constant countdown.

## Closed

- [x] **Fix 'Generate Schema' button position** — Moved directly below the "Answer PDF" file input inside the same grid cell, clearly grouping the related upload + generate actions. Button now shows a shadcn/ui `Spinner` (animated `Loader2Icon`) during generation.
- [x] **Add top panel to separate logout/account from page options** — A dedicated top panel (navbar/header) should separate the logout/account button from the page-level navigation options, improving layout clarity and preventing accidental logouts.
- [x] **Add default duration choices when creating exercises** — Added 60 / 90 / 120 min quick-select buttons below the duration input (visible only when timed mode is on). Active preset is highlighted with the default button style.
- [x] **Mark required fields with asterisk when creating exercises** — Added `*` (visually, `aria-hidden`) to "Exercise title" (always required) and "Duration (minutes)" (required only when timed mode is on).
- [x] Phone prefix: accept '0' prefix for local convenience but store as '+84' in database — `normalizePhone()` added to both `src/lib/validation.js` and `worker/lib/auth.js`. Called before validation in LoginPage, RegisterPage, and all backend routes (register, login, teacher-create-student). Placeholder updated to `0xxxxxxxxx or +84xxxxxxxxx`.
- [x] **Consolidate correctness indicator colors** — `CorrectnessIcon` now uses `text-success` (light: `oklch(0.627 0.194 142.495)`, dark: `oklch(0.740 0.179 151.711)`) and `text-destructive`. `--success` added as a CSS variable to `:root`/`.dark` and exposed via `@theme inline`.
