# SmartClass product truth

**Last reviewed:** 2026-09-04

SmartClass is an assessment platform for teaching and learning. It is a focused learning workspace, not a marketing surface.

## People and core jobs

- **Teachers (administrators)** create and manage student accounts, create exercises from PDFs, define answer schemas, manage an ordered video curriculum, and review the learning workflow.
- **Students** browse exercises, start timed or untimed attempts, answer through per-question controls, receive automatic grading, review past results, and follow the video curriculum.

Guest access remains planned work in [`TODO.md`](TODO.md). Do not describe it as shipped without newer product evidence.

## Lecture model

- Teachers create, edit, show or hide, reorder, and delete lectures. Each lecture has a section, title, supported public YouTube video URL, student visibility state, and one or more grade levels (10, 11, or 12). New lectures are visible by default and default to all three grades.
- The lecture order is global. Consecutive lectures with the same section are presented together without changing that order.
- Teachers can expand one embedded video at a time while managing the curriculum.
- Students browse visible lectures that overlap at least one of their grade memberships and watch each one on a dedicated, readable URL with embedded playback and previous/next navigation. Hidden or non-overlapping lectures and their player pages are unavailable to students.
- Lecture browsing is available only to authenticated teachers and students.

## Account access

- Teachers and students sign in with their phone number and password.
- New student accounts require a name, whether students register themselves or a teacher creates the account. Legacy accounts may remain unnamed until updated.
- A signed-in teacher or student can change their own name from Settings. Teachers can also rename student accounts from the student list.
- A student can belong to one or more high-school grades: 10, 11, and 12. Grade memberships accumulate when appropriate, so a student can retain grade 10 access after also receiving grade 11 access. “All grades” is an interface shortcut for selecting all three memberships, not a stored grade.
- Only teachers can assign grade memberships. Teachers select grades when creating a student and can replace the memberships of multiple selected students at once. A self-registered student has no grade access until a teacher assigns it.
- A signed-in teacher can change their own password from Settings after verifying their current password.
- Password changes never target another account; student password changes and teacher-managed password resets remain roadmap work.

## Assessment model

- Exercises may be timed or untimed and target one or more grades (10, 11, or 12), defaulting to all three. Teachers provide an answer-free Exercise PDF for students and a separate teacher-only Answer PDF containing answers or green highlights. Keeping the student copy free of answer cues is the teacher's responsibility.
- Supported answer types are multiple choice (A/B/C/D), numeric, and true/false questions with four independently answered sub-questions (`a`–`d`).
- Teachers prepare an exercise through one review workflow. SmartClass detects question regions in the Exercise PDF, renders ordered question images, and combines Answer PDF parsing with deterministic green-highlight candidates from the Answer PDF in one editable answer table.
- A teacher reviews every generated image and final answer, resolves conflicts, and activates both as one version. A rejected question can be retried, replaced with one clean screenshot, or resolved by replacing the source PDF. Scanned-PDF vision detection is not enabled; unsupported PDFs require screenshots or replacement.
- Students can browse or start only exercises with a teacher-confirmed active question set and at least one grade that overlaps their memberships. A started submission pins that set and its answer-schema snapshot, and remains available if current grade access later changes, so later exercise or access changes cannot break an active attempt or historical review.
- Students enter answers directly in the take page. It does not offer an answer-photo upload or input-mode selector.
- Grading runs after submission. Results distinguish correct, incorrect, and skipped answers and use a score on a 0–10 scale.
- A student starts an attempt explicitly from the exercise landing page. On desktop and tablet, the take experience temporarily uses a compact app rail and wide workspace to prioritize the selected question image while keeping matching answer controls visible. On phones, the answer-sheet control appears first, followed by the selected-question preview and then its answer controls; tapping the preview opens a full-screen viewer with pinch and button zoom, and landscape orientation provides more reading space. An authenticated download of the complete answer-free Exercise PDF remains available for paper or another device. Numbered, Previous, and Next navigation update the image and answer controls together at every size.
- Submitted attempts have a summary and a detailed question-first review using the pinned images. Correct-answer visibility is protected while an attempt is in progress.

## Product principles

1. Keep the exercise, current task, progress, and next action dominant.
2. Preserve student agency: do not auto-submit extracted answers or an expired timed attempt.
3. Keep dense assessment and administration work calm, legible, and efficient.
4. Use plain language that tells people what happened and what they can do next.
5. Show the system's truthful current state in text or accessible labels; do not rely on color alone or imply that unfinished work succeeded.
6. Make failures recoverable: preserve valid input where possible and provide a clear retry, correction, or exit path.
7. Protect answer and account boundaries in the API, not only in the interface.

## Sources of truth

- This document is authoritative for shipped product behavior.
- [`TODO.md`](TODO.md) tracks planned work and is not evidence of shipped behavior.
- [`AGENTS.md`](AGENTS.md) contains engineering instructions and points to technical references; it is not a product specification.
- [`DESIGN.md`](DESIGN.md) is the visual implementation contract.
- Approved RFCs in [`docs/plans/`](docs/plans/) record decisions, rationale, and migration status.

`TODO.md` and RFCs may contain proposed or superseded behavior. When they conflict with this document, use this document for shipped behavior and reconcile the stale reference. Update this document only when stable product truth changes.
