# UI/UX Feedback

## Open Issues

- [ ] **Fix 'Generate Schema' button position** — The 'Generate Schema' button should be repositioned to be visually grouped with the "Upload Answer PDF" button, as they are related actions in the exercise creation flow. Currently the button placement is unintuitive and may confuse teachers about the workflow order.
- [ ] **Add top panel to separate logout/account from page options** — A dedicated top panel (navbar/header) should separate the logout/account button from the page-level navigation options, improving layout clarity and preventing accidental logouts.
- [ ] **Support drag-and-drop for file upload** — File upload inputs should accept drag-and-drop in addition to the click-to-browse interaction, improving usability especially for teachers uploading PDFs.
- [ ] **Add default duration choices when creating exercises** — Provide quick-select options (e.g. 60, 90, 120 mins) alongside the manual input field so teachers can set common durations without typing.
- [ ] **Mark required fields with asterisk when creating exercises** — Add an asterisk (`*`) to required field labels in the exercise creation form so teachers can clearly identify which fields must be filled before submitting.
- [ ] Clicking 'refresh' button should show last refreshed time — When teachers click the refresh button on the exercise list page, display a timestamp indicating when the data was last refreshed to provide feedback that the action was successful.
- [ ] Phone prefix: accept '0' prefix for local convenience but store as '+84' in database
- [ ] Allow students to hide the timer because they can feel frustrated when they are taking the test and the timer is ticking. Just notify on certain time intervals (e.g. 30 mins left, 10 mins left) instead of showing a constant countdown.
