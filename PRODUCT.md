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

## Assessment model

- Exercises may be timed or untimed and may include an exercise PDF.
- Supported answer types are multiple choice (A/B/C/D), numeric, and true/false questions with four independently answered sub-questions (`a`–`d`).
- Photo input uses a schema-aware multimodal model to extract answers. Extraction only pre-fills the form; the student remains responsible for reviewing and submitting it.
- Grading runs after submission. Results distinguish correct, incorrect, and skipped answers and use a score on a 0–10 scale.
- A student starts an attempt explicitly from the exercise landing page. The take experience presents one selected question at a time alongside the answer sheet navigation and, when available, the exercise PDF.
- Submitted attempts have a summary and a detailed review. Correct-answer visibility is protected while an attempt is in progress.

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
