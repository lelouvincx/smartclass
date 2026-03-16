# UI/UX Feedback

## Open Issues

- [x] **Fix 'Generate Schema' button position** — Moved directly below the "Answer PDF" file input inside the same grid cell, clearly grouping the related upload + generate actions.
- [ ] **Add top panel to separate logout/account from page options** — A dedicated top panel (navbar/header) should separate the logout/account button from the page-level navigation options, improving layout clarity and preventing accidental logouts.
- [ ] **Support drag-and-drop for file upload** — File upload inputs should accept drag-and-drop in addition to the click-to-browse interaction, improving usability especially for teachers uploading PDFs.
- [x] **Add default duration choices when creating exercises** — Added 60 / 90 / 120 min quick-select buttons below the duration input (visible only when timed mode is on). Active preset is highlighted with the default button style.
- [x] **Mark required fields with asterisk when creating exercises** — Added `*` (visually, `aria-hidden`) to "Exercise title" (always required) and "Duration (minutes)" (required only when timed mode is on).
- [ ] Clicking 'refresh' button should show last refreshed time — When teachers click the refresh button on the exercise list page, display a timestamp indicating when the data was last refreshed to provide feedback that the action was successful.
- [ ] Phone prefix: accept '0' prefix for local convenience but store as '+84' in database
- [ ] Allow students to hide the timer because they can feel frustrated when they are taking the test and the timer is ticking. Just notify on certain time intervals (e.g. 30 mins left, 10 mins left) instead of showing a constant countdown.
- [ ] **Consolidate correctness indicator colors** — `CorrectnessIcon` in `StudentTakeExercisePage.jsx` hardcodes `text-green-600`/`text-red-500`. Consider using consistent semantic color tokens if a theme system is introduced.
