# SmartClass product truth

**Last reviewed:** 2026-09-03

SmartClass is an assessment platform for teaching and learning. It is a focused learning workspace, not a marketing surface.

## People and core jobs

- **Teachers (administrators)** create and manage student accounts, create exercises from PDFs, define answer schemas, manage an ordered video curriculum, and review the learning workflow.
- **Students** browse exercises, start timed or untimed attempts, answer manually or use a photo to pre-fill answers, review extracted answers before submission, receive automatic grading, review past results, and follow the video curriculum.

Guest access remains planned work in [`TODO.md`](TODO.md). Do not describe it as shipped without newer product evidence.

## Lecture model

- Teachers create, edit, reorder, and delete lectures. Each lecture has a section, title, and supported public YouTube video URL.
- The lecture order is global. Consecutive lectures with the same section are presented together without changing that order.
- Teachers can expand one embedded video at a time while managing the curriculum.
- Students browse the sectioned curriculum and watch each lecture on a dedicated, readable URL with embedded playback and previous/next navigation.
- Lecture browsing is available only to authenticated teachers and students.

## Account access

- Teachers sign in with their phone number and password.
- A signed-in teacher can change their own password from Settings after verifying their current password.
- Password changes never target another account; student password changes and teacher-managed password resets remain roadmap work.

## Assessment model

- Exercises may be timed or untimed. The complete source exercise PDF is retained for teacher use, and the optional Answer PDF remains teacher-only.
- Supported answer types are multiple choice (A/B/C/D), numeric, and true/false questions with four independently answered sub-questions (`a`–`d`).
- Teachers prepare an exercise through one review workflow. SmartClass detects question regions in supported born-digital PDFs, renders ordered answer-free question images, and combines Answer PDF parsing with deterministic green-highlight answer candidates in one editable answer table.
- A teacher reviews every generated image and final answer, resolves conflicts, and activates both as one version. A rejected question can be retried, replaced with one clean screenshot, or resolved by replacing the source PDF. Scanned-PDF vision detection is not enabled; unsupported PDFs require screenshots or replacement.
- Students can browse or start only exercises with a teacher-confirmed active question set. A started submission pins that set and its answer-schema snapshot so later replacements cannot change an active attempt or historical review.
- Photo input uses a schema-aware multimodal model to extract answers. Extraction only pre-fills the form; the student remains responsible for reviewing and submitting it.
- Grading runs after submission. Results distinguish correct, incorrect, and skipped answers and use a score on a 0–10 scale.
- A student starts an attempt explicitly from the exercise landing page. The take experience presents only the selected question image segments and matching answer controls; numbered, Previous, and Next navigation update them together. The complete PDF is not available in the student experience.
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
