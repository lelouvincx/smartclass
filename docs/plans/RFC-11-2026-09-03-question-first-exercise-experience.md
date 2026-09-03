---
rfc: RFC-11
title: Question-first exercise experience
date: 2026-09-03
status: Accepted
dependencies: [RFC-5, RFC-6, RFC-8, RFC-9]
---

# RFC: Question-first exercise experience

## Trigger

Chinh asked to redesign `/student/exercises/:id/take` after the production exercise and the legacy UniApp LMS were tested directly. Chinh chose these product directions:

- show only the selected question in the student's left panel;
- show the matching answer controls in the right panel;
- update both panels together when the student changes question;
- remove the full-PDF viewer from the student experience;
- retain the complete source PDF for teachers;
- find question boundaries automatically rather than asking teachers to split the PDF manually;
- let a teacher replace one rejected generated question with a screenshot instead of replacing the complete PDF; and
- combine Answer PDF extraction, green-highlight extraction, and manual correction into one teacher-reviewed answer-key workflow while keeping student question images answer-free.

## Problem

The current take page combines two interaction models that do not share a position:

- an independently scrolling PDF iframe; and
- answer controls whose selected question is React state outside the iframe.

Changing the selected question updates the answer state but cannot reliably move the iframe to the corresponding PDF content. The answer form can also remain below the viewport. Hiding and showing the iframe remounts the PDF, which repeats a comparatively expensive navigation and render.

A simple `scrollIntoView()` fix would move the answer form but would not align the PDF, remove iframe latency, or produce the one-question-at-a-time workspace Chinh selected.

Automatic isolation introduces a separate correctness risk: some exercise PDFs include solutions in the same source document. A bad boundary can expose a correct answer during an active attempt. Some source PDFs also mark correct answers with green highlighting. That highlighting can provide useful answer-key evidence, but it cannot remain visible in a student asset or become a grading answer without teacher review.

## Findings

### Production SmartClass

Research on 2026-09-03 used the seeded active student account and exercise 9 at a 1440 × 1000 viewport.

- Selecting question 20 changed the current-question state, but the window remained at `scrollY = 0` while the matching answer form began around `y = 1154`, outside the viewport.
- The PDF iframe occupied approximately 515 × 858 pixels.
- Hiding and showing the PDF issued another PDF request. The observed remount navigation took about 1.5 seconds.
- The downloaded source was a 9-page, 3.9 MB born-digital PDF.
- Its text contains inline `Lời giải` sections after questions 18 onward. Automatic generation therefore has a credible answer-leak failure mode, not only a theoretical one.

### Legacy UniApp LMS

The legacy LMS keeps one selected question in a stable, visible content slot. A compact rail keeps question navigation, progress, and submission controls available without making students coordinate two unrelated scroll positions.

SmartClass should reuse this interaction principle, not copy the legacy styling: the selected question and its answer controls are one synchronized workspace, while navigation stays stable.

### Current implementation

- `StudentTakeExercisePage.jsx` changes `currentQId` when a student jumps to a question.
- `PdfSplitPane` conditionally mounts a browser PDF iframe and cannot target question regions inside the document.
- `src/lib/pdf.js` already loads PDF.js for text extraction, but no question-region model exists.
- Teachers upload one source exercise PDF to R2. The same file remains useful for teacher preview and management.
- The create page can separately extract text from an optional Answer PDF, send that text to the existing schema-parsing LLM, and place its normalized rows into an editable answer-key table.
- Answer PDF parsing does not preserve color or geometry, and it currently finishes before the separate question-view generation workflow begins.
- The public exercise response strips `correct_answer` for non-teachers, but the exercise PDF itself can contain solution text.

### Automatic-detection proof of concept

The 2026-09-03 proof of concept found all 25 question markers in exercise 9 and proposed 28 ordered segments, including three questions that cross pages. This makes PDF text geometry useful for generating candidate regions.

The proof of concept also found failures that prevent automatic publication:

- some candidate crops clipped question content or conflicted with a conservative solution boundary;
- question 17 contains a green answer highlight embedded in the PDF page content, so hiding PDF annotations does not remove it;
- PDF text extraction omitted mathematical content and produced empty text for a required diagram-only segment; and
- the tested vision models did not return valid question geometry.

Therefore, text geometry is a candidate generator, not a safety authority. A generated set still requires complete teacher review. Scanned/image-only detection must pass a separate vision proof of concept before it can ship.

Visual review of exercise 9 found that the green highlights on questions 1–17 identify one multiple-choice option. The isolated previews for questions 18–25 did not demonstrate an equally deterministic mapping for true/false and numeric answers. Green-highlight extraction is therefore viable as a schema-aware suggestion mechanism, but it must abstain whenever the marked value cannot be mapped unambiguously to the declared question type.

The existing Answer PDF extraction for the local exercise-9 fixture produced 24 of 25 question IDs and omitted question 22, while question-marker detection found all 25. This demonstrates why neither source should run as a disconnected authority: comparing their key sets can catch an incomplete answer key before activation.

## Analysis

### Keep one source PDF

Splitting every exercise into many source PDFs would duplicate teacher work, complicate replacement, and create another source of truth. The original PDF should remain one teacher-owned file.

### Derive student assets once

Cropping from the PDF in every student browser would avoid an iframe but still make each student download, parse, and render the complete document. Instead, SmartClass should generate optimized question images once during the teacher workflow. Students then fetch only the selected question and its neighbors.

Each question may need more than one ordered image segment because a question can cross pages or depend on a shared stimulus. The data model must not assume one rectangle or one page per question.

### Automatic validation is not proof of safety

Known question markers, solution markers, expected question IDs, valid bounds, and confidence thresholds can reject many bad generations. They cannot prove that no solution or correct answer is present. Because an incorrect crop breaks the product's answer-visibility boundary, automated validation may generate previews but may not activate them for students.

The smallest safe first release keeps detection automatic and adds one teacher confirmation over the complete preview set. It does not add a crop editor. When one generated question is unacceptable, the teacher can replace that question with one clean screenshot without replacing the source PDF.

### Combine answer candidates, keep teacher authority

SmartClass already has one useful answer source: an LLM converts extracted Answer PDF text into schema rows. Green-highlight extraction adds a second independent source. Both should feed the same proposed answer table rather than create a second answer-key interface.

The Answer PDF parser may propose question IDs, types, sub-question IDs, and answers. The green extractor may propose answers only when a supported highlight maps unambiguously to that schema shape. Existing or manually entered values remain editable teacher input. All candidates are normalized to the same `(q_id, sub_id, type, proposed_answer)` shape and merged by question key.

- When both automatic sources return the same normalized value, show that they agree.
- When only one source returns a value, show its source and require normal teacher review.
- When sources disagree, or a candidate disagrees with an existing teacher value, show a blocking conflict until the teacher chooses or edits the final answer.
- When neither source returns a valid value, leave the row for manual completion.
- When the question IDs or types disagree, block preparation until the teacher corrects the schema shape.

No automatic source silently wins. The teacher reviews one complete answer table together with source evidence and the question previews. The teacher's confirmed schema remains the sole grading authority and is snapshotted atomically with the activated question assets. Green extraction itself uses deterministic color and geometry rules, not an AI or vision-model fallback.

### Prepare the answer key and question views as one workflow

On create, the optional Answer PDF parser or manual rows first establishes a proposed question structure. The exercise PDF detector validates that structure against its question markers, adds green-highlight candidates, and generates isolated images. The teacher then resolves one merged answer table and one complete image review. **Confirm answers and activate** is the only action that makes the paired schema and images student-ready.

```diagram
Answer PDF ───▶ existing text/LLM parser ───▶ answer candidates ──┐
                                                                 │
Exercise PDF ─▶ deterministic green extractor ▶ answer candidates ├──▶ one editable answer table ──┐
                                                                 │                                │
Manual entry ───────────────────────────────────▶ teacher draft ──┘                                ├──▶ one teacher confirmation ──▶ atomic activation
                                                                                                  │
Exercise PDF ─▶ question-boundary detector ─────▶ answer-free image previews ──────────────────────┘
```

Saving the exercise metadata and uploading source files may occur before final confirmation so the pending assets have an owner. Until an active set exists, that intermediate exercise remains teacher-only after cutover. A partial upload or abandoned review must not expose the exercise to students.

### Sanitize or reject answer-marked student images

Extracting a correct answer does not make its marked question image safe for students. If the highlight is in an excluded solution region, it never enters the student crop. If it is inside the question region, SmartClass may generate a clean image only when a bounded background-highlight mask can be removed without altering foreground text, formulas, diagrams, or legitimate green content. The cleaned image must pass answer-cue detection again and remain subject to teacher preview.

If sanitization is ambiguous, damages content, or leaves a visible answer cue, the question remains blocked. The teacher must then upload a clean question screenshot or replace the PDF.

## Decision

SmartClass will use a **question-first student experience** backed by automatically generated, teacher-confirmed question asset sets.

One full source PDF remains in R2 for teacher use. A teacher may also provide a teacher-only Answer PDF or enter answers manually. During exercise creation, source replacement, or legacy backfill, SmartClass runs the existing Answer PDF text parser and deterministic green-highlight extraction as independent candidate sources, merges their normalized results into one reviewable answer table, detects question regions, and renders answer-free optimized question images. The teacher resolves answer conflicts and previews the entire image set. The teacher can reject a generated question and upload one replacement screenshot for that question. The teacher then selects **Confirm answers and activate**. Activation makes the complete asset set and its teacher-confirmed answer schema active atomically.

Students never load or render the source PDF after cutover. The selected question's isolated image segments appear in the left panel and the matching answer controls appear in the right panel. Selecting a question changes both panels in the same state transition.

This RFC supersedes RFC-6 only where RFC-6 chose a student full-PDF split pane and independent question navigation. RFC-6 remains authoritative for the submission lifecycle, timer, manual/photo answer input, unanswered states, grading, summary, and review behavior unless this RFC explicitly changes the rendering source.

## Goals

- Make question changes immediate and spatially predictable.
- Remove full-PDF download, iframe navigation, and PDF rendering from student take and review pages.
- Preserve the full source PDF for teachers.
- Generate isolated question views automatically for supported born-digital PDFs.
- Combine existing Answer PDF extraction and green-highlight extraction into one proposed answer key.
- Detect answer-source agreement, missing rows, schema mismatches, and conflicting values before activation.
- Suggest correct answers when green highlights map unambiguously to the proposed answer schema.
- Remove supported answer-background highlights from student assets without changing question content, and block assets that cannot be cleaned safely.
- Gate scanned/image-only automatic detection on a successful vision-model proof of concept; use question screenshots or PDF replacement until then.
- Let teachers replace one rejected generated question with a screenshot without replacing the complete PDF.
- Prevent partial, mixed-version, low-confidence, or unconfirmed assets from reaching students.
- Preserve the question version seen when a submission starts.
- Preserve English/Vietnamese parity, keyboard access, touch targets, timer behavior, answer modes, and submission semantics.

## Non-goals

- Asking teachers to upload one PDF per question.
- Shipping a manual crop or bounding-box editor in the first release.
- Editing screenshot pixels, drawing screenshot bounds, or inferring a question ID from the screenshot filename.
- Replacing student photo-answer extraction or changing grading rules.
- Replacing the existing text-based Answer PDF model in this RFC.
- Inferring correct answers from unhighlighted prose, formulas, diagrams, or an AI model.
- Automatically accepting a detected answer or activating an answer schema without teacher review.
- Redesigning teacher file management beyond generation status, preview, retry, and activation.
- Mutating production files or backfilling production exercises without separate approval.

## Experience design

### Student desktop

```diagram
┌───────────────────────────────────┬─────────────────────────┐
│ Question 20                       │ Answer sheet            │
│                                   │                         │
│ ┌───────────────────────────────┐ │ Question 20 of 25       │
│ │ isolated question segment(s)  │ │ matching answer control │
│ │ from the confirmed asset set  │ │                         │
│ └───────────────────────────────┘ │ Previous        Next    │
│                                   │                         │
│                                   │  1  2  3 ... 20 ... 25 │
│                                   │ Timer            Submit │
└───────────────────────────────────┴─────────────────────────┘
```

- The question panel and answer panel are peers in one workspace.
- The current answer control appears near the top of the right panel; students do not scroll past unrelated questions.
- Previous, Next, and numbered navigation all call the same question-selection action.
- Selection updates the heading, image segments, answer controls, progress, and current navigation state together.
- The question panel returns to its top and moves focus to the question heading without smooth body scrolling.
- The active question image loads first. The previous and next question images preload in the background.
- Timer visibility, manual/photo mode, draft answers, leave protection, unanswered counts, and submit confirmation keep their current behavior.

### Student mobile

- Use one page scroller: isolated question segment(s), then the matching answer controls.
- Keep Previous and Next available without forcing a second scroll container.
- Put the numbered answer sheet in the existing compact sheet/drawer pattern.
- Selecting a question from the sheet closes it, changes both question and answer content, resets the question workspace to its top, and focuses the question heading.
- Do not mount a PDF iframe or offer a full-PDF toggle.

### Student review

The detailed review page uses the question asset set pinned to that submission, so it can show the same isolated question next to the submitted and correct answer. It no longer needs the source-PDF iframe. Summary, grading, correctness, and skipped-answer behavior remain unchanged.

### Teacher

- Teacher create and view pages retain the complete exercise PDF and any teacher-only Answer PDF.
- The teacher supplies an exercise PDF and may supply an Answer PDF. Without a usable Answer PDF, the teacher defines question IDs and types manually before green-answer mapping runs.
- One **Prepare exercise** flow parses the Answer PDF, validates its proposed structure against exercise-PDF question markers, extracts green-highlight candidates, renders question images, and uploads one pending set.
- The UI shows deterministic progress for both branches: reading source files, parsing the Answer PDF, detecting question boundaries and highlights, merging answer candidates, rendering previews, uploading, ready for review, or failed.
- One answer table labels each row as **Sources agree**, **From Answer PDF**, **From green highlight**, **Conflict**, or **Manual answer needed**.
- The teacher edits that table directly. No source silently replaces an existing answer, and unresolved key/type/value conflicts disable activation.
- The review screen shows every generated answer-free visual crop, labelled by question and segment.
- Each automatic answer candidate retains teacher-only provenance and evidence: Answer PDF/model metadata for parsed text, or source page and rectangle for a green highlight.
- Missing or ambiguous candidates leave the answer empty or unchanged for manual completion. They do not invent a value or prevent activation once the teacher supplies a valid final answer.
- A teacher can reject one generated question. The rejected question then offers **Retry detection**, **Upload question screenshot**, and **Replace PDF**.
- A screenshot replaces all generated segments for that question in the pending set; it does not modify the source PDF or another question.
- The screenshot upload accepts one complete PNG, JPEG, or WebP image. The current question ID comes from the review slot, not from image analysis or the filename.
- SmartClass may retain text extracted from the PDF as optional, best-effort metadata. Teachers do not review or correct it, and missing text does not block activation.
- Missing, invalid, rejected, or low-confidence questions disable activation until automatic regeneration or a valid screenshot resolves them.
- A valid set with a complete answer schema offers one explicit **Confirm answers and activate** action. Its copy asks the teacher to verify both that the answers are correct and that no solutions or answer cues are visible in student images.
- The first release has no resize, drag, merge, or split controls. A teacher can replace an unsafe crop with a screenshot, but cannot edit the generated crop itself.

## Combined preparation pipeline

### 1. Read both source files

Use the existing lazy PDF.js boundary in `src/lib/pdf.js` to open the teacher-selected or existing exercise PDF and optional Answer PDF. Extract Answer PDF text through the existing browser path and retain exercise-PDF page geometry and renders for question detection. Keep this work out of the student bundle path.

### 2. Establish and validate the proposed schema shape

Use normalized rows from the existing Answer PDF parser when available. Otherwise require the teacher to define the expected question IDs and types manually. Correct-answer values may still be missing at this point.

Compare that proposed key set with question markers found in the exercise PDF. Missing or unexpected question IDs, incomplete boolean sub-question structures, duplicate keys, or conflicting types stop preparation for teacher correction. The question-image detector and both answer sources must converge on one public schema shape before activation.

### 3. Prefer text geometry for question boundaries

For born-digital pages, inspect PDF.js text items and their geometry.

- Match the expected schema IDs against markers such as `Câu N` and `Question N`.
- End a region before the next question marker or a solution marker such as `Lời giải`, `Solution`, or `Đáp án` when it denotes an answer section.
- Preserve source page and normalized top-left coordinates in the range 0–1.
- Emit multiple ordered segments when a question crosses a page boundary or needs shared source material.

Marker rules must be tested against Vietnamese and English fixtures. They are versioned detection logic, not ad hoc component code.

### 4. Collect Answer PDF candidates

Send extracted Answer PDF text through the existing teacher-authenticated schema parser. Preserve its normalization, strict MCQ/boolean/numeric validation, per-row confidence, and manual fallback. The parser must abstain instead of guessing: a row below the 0.75 confidence threshold, or without valid confidence, retains its question structure but has an empty answer and is not recorded as an `answer_pdf_text` candidate. Record the remaining valid rows as candidates rather than treating the model response as the final schema.

If the parser fails, omits rows, returns unexpected keys, or returns invalid values, retain any valid non-conflicting candidates and make the gaps recoverable through green-highlight candidates or manual answers. Do not send the Answer PDF to the question-boundary vision detector.

### 5. Collect green-highlight candidates

Analyze the original teacher-only page render before excluding solution regions or sanitizing student crops. Combine bounded green-pixel components with PDF text geometry and the teacher-declared question types.

- For multiple choice, suggest an answer only when exactly one supported highlight maps to one `A`, `B`, `C`, or `D` option.
- For true/false, suggest a sub-answer only when exactly one supported highlight maps to `true` or `false` for one declared `a`–`d` sub-question.
- For numeric questions, suggest an answer only when the highlighted text parses under the existing numeric-answer normalization rules.
- Associate each suggestion with its question, optional sub-question, source page, source rectangle, extraction method, and confidence.
- Keep the marked evidence teacher-only. It must never be returned by a student route or embedded in a student asset.
- Produce no suggestion for zero, multiple, conflicting, unparseable, or structurally ambiguous highlights.

This stage does not call a vision model and does not infer an answer from mathematical reasoning. It only maps explicit green answer marks to the proposed schema shape.

### 6. Merge answer candidates

Normalize Answer PDF and green-highlight candidates with the existing schema rules, then merge by `(q_id, sub_id)`:

- identical schema-valid values become one **Sources agree** proposal with both provenances;
- one valid value becomes a labelled single-source proposal;
- differing values or types become a blocking conflict with both source values visible to the teacher;
- missing keys become manual-answer rows; and
- unexpected keys remain blocking until the teacher corrects the proposed schema shape or replaces a source file.

The merged table is a draft. It cannot be used for grading until the teacher reviews it and confirms activation.

### 7. Fall back to vision for question boundaries

For image-only pages or unresolved expected question IDs, render only the necessary pages and send them to a teacher-authenticated Worker endpoint. The endpoint uses the existing approved vision-model boundary and requires strict structured output:

- expected `q_id` values;
- one or more normalized rectangles per question;
- segment order and page number;
- detected question text;
- detected solution/answer-region exclusions; and
- confidence.

Do not send the separate solution PDF, reference images, or `correct_answer` values to the detector. The detector receives only the exercise pages and expected public question IDs.

The proof of concept did not validate this fallback. Do not enable vision-generated assets in production until one approved model passes the same structural evaluator and teacher visual review used for text-generated candidates. Until then, a scanned/image-only PDF must use per-question screenshots or be replaced.

### 8. Validate question assets and merged answers

Before rendering or upload, validate the combined result:

- every expected `q_id` has at least one segment;
- no unexpected or duplicate `(q_id, segment_index)` exists;
- page numbers and normalized rectangles are in bounds and non-empty;
- segment order is contiguous;
- regions do not intersect detected solution/answer areas;
- answer highlights inside a final student region are either safely sanitized or remain blocking;
- every final answer row has one schema-valid teacher-reviewed value;
- no answer-source key/type/value conflict remains unresolved;
- vision-derived segments meet the configured confidence threshold.

Any failed asset-safety rule blocks activation. A missing or ambiguous answer suggestion is non-blocking only when the teacher supplies a valid final answer manually. Warnings may explain failures but may not override an unsafe student image in the first release.

### 9. Render derived assets

Render validated rectangles into legible WebP images at a bounded high-density resolution. Preserve diagrams, formulas, option labels, and source aspect ratio. Store normalized source coordinates alongside the image so a later crop editor can regenerate assets without changing the source model.

Prefer omitting a PDF highlight annotation when that produces the same unmarked source content. For highlights embedded in page pixels, remove only a validated green background mask within the detected answer mark while preserving non-green foreground glyphs. Do not remove arbitrary green page content. Re-run answer-cue detection against the rendered result; any residual cue or uncertain content change blocks the question and routes it to screenshot replacement or PDF replacement.

Text items inside a region may be stored as optional, best-effort metadata. PDF text extraction is not reliable for formulas, diagrams, or all mathematical notation, so this metadata is not presented as an accessible equivalent, does not require teacher review, and does not affect confidence or activation. A complete accessible representation is deferred until a pipeline can preserve those elements accurately.

### 10. Resolve rejected questions

When a teacher rejects a generated question, keep the asset set pending. The teacher can retry automatic detection, replace the complete PDF, or upload one screenshot into that question's review slot.

A screenshot becomes one manual segment and replaces every generated segment for that `q_id` in the pending set. The teacher previews the screenshot under the same answer-leak rules. Replacing a pending question never changes the active set seen by students.

### 11. Review and activate

Upload all generated segments and answer candidates into a pending immutable asset set. Automated checks run again on the server. A teacher then reviews the complete answer-free image set, both sources' answer evidence, and one merged final answer schema. One D1 batch records confirmation, snapshots the teacher-confirmed schema, and changes the exercise's active-set pointer. If upload, validation, or activation fails, the previous active set and answer schema remain unchanged.

## Data model

Implementation adds a D1 migration and updates `docs/schema.dbml` in the same change.

### `exercise_question_asset_sets`

One immutable generation derived from one source exercise PDF.

- `id`
- `exercise_id`
- `source_file_id`
- nullable `answer_source_file_id`
- `detector_version`
- `detection_method` (`text`, `vision`, `manual`, or `mixed`)
- `confirmed_by`
- `confirmed_at`
- `created_at`

`source_file_id` identifies the exercise PDF. `answer_source_file_id` identifies the Answer PDF used for candidates when one exists. An unconfirmed row is pending. An exercise points to at most one active set. Older confirmed sets remain available to submissions that were started against them.

### `exercise_question_assets`

One ordered visual segment within a set.

- `id`
- `asset_set_id`
- `q_id`
- `segment_index`
- `source_kind` (`pdf_crop` or `teacher_screenshot`)
- nullable `source_page`
- nullable normalized `x`, `y`, `width`, and `height`
- `r2_key`, MIME type, byte size, pixel width, and pixel height
- nullable `accessible_text` containing optional, best-effort PDF extraction
- nullable `confidence`

Enforce uniqueness for `(asset_set_id, q_id, segment_index)`. Store generated files under generation-specific R2 keys so confirmed assets are immutable and cacheable.

PDF crops require source coordinates and detector confidence. A teacher screenshot has no PDF coordinates or detector confidence, but still requires valid image metadata.

### `exercise_question_answer_candidates`

One teacher-only answer proposal from one automatic source.

- `id`
- `asset_set_id`
- `q_id`
- nullable `sub_id`
- `type`
- `proposed_answer`
- `source_kind` (`answer_pdf_text` or `exercise_green_highlight`)
- `source_file_id`
- nullable `extractor_version` and `model_id`
- nullable `source_page`
- nullable normalized `source_x`, `source_y`, `source_width`, and `source_height`
- `confidence`
- `created_at`

Enforce at most one normalized candidate per `(asset_set_id, q_id, sub_id, source_kind)`, including null `sub_id` values. Green candidates require source geometry; Answer PDF candidates require extractor provenance. Candidates and evidence remain teacher-only and never participate directly in grading. Candidate agreement and conflict are derived from these rows. A candidate becomes an answer only when the teacher submits it, or an edited value, in the final schema during activation.

### `exercise_question_answer_schemas`

One immutable answer-schema snapshot for a confirmed asset set.

- `id`
- `asset_set_id`
- `q_id`
- nullable `sub_id`
- `type`
- `correct_answer`
- `created_at`

Enforce uniqueness for `(asset_set_id, q_id, sub_id)`, including null `sub_id` values. Activation writes this snapshot in the same D1 batch as the current exercise schema, confirmation, and active pointer. Student take, grading, extraction, and detailed review resolve through the submission's pinned snapshot. This prevents a later PDF or answer-key replacement from pairing old question images with new answer controls or grading rules.

### Pointers

- Add `exercises.active_question_asset_set_id`.
- Add nullable `submissions.question_asset_set_id` for migration, then populate it whenever a new submission starts.

Pinning the set and its answer-schema snapshot at submission creation prevents a teacher's later PDF or answer-key replacement from changing an in-progress attempt or historical review. A nullable pointer remains only as the explicit Stage A compatibility path for legacy submissions until backfill.

## API contracts and test seams

The exact route modules may follow repository conventions, but these public behaviors are fixed before test-first implementation:

1. A teacher-only create-set operation accepts a source exercise file and optional Answer PDF file, verifies both belong to the exercise, and creates a pending asset set.
2. A teacher-only asset upload operation accepts one generated image segment plus its validated metadata and optional best-effort extracted text. The server verifies the image format and pixel dimensions from the uploaded bytes rather than trusting multipart metadata. XHR is permitted only for image upload progress; other frontend calls continue through `request()`.
3. The existing teacher-only Answer PDF parser remains available to the combined preparation flow and returns normalized candidates rather than bypassing teacher review.
4. A teacher-only candidate upload operation accepts Answer PDF and green-highlight proposals with source provenance, validates each value against its declared schema type, and never overwrites a current correct answer.
5. A teacher-only preview operation returns every pending segment, answer candidate, agreement, conflict, and missing-answer state in question order. Source evidence remains teacher-only.
6. A teacher-only screenshot-replacement operation accepts one validated PNG, JPEG, or WebP for an explicit pending-set `q_id`. It removes that question's pending generated segments and inserts one manual segment atomically after upload succeeds.
7. Screenshot replacement rejects an unknown question ID, another exercise's set, a confirmed set, or invalid image metadata.
8. Final exercise save accepts a pending set ID with the complete teacher-reviewed answer schema, validates completeness and conflict resolution against that schema, and uses `DB.batch()` to update the schema, confirmation, and active-set pointer atomically. Once an exercise has an active set, a schema change requires a replacement set so new attempts cannot pair the active images with a different mutable schema.
9. Activation is rejected when the set belongs to another exercise, references an outdated exercise or Answer PDF, has missing, unexpected, or rejected question IDs, contains incomplete uploads, has invalid bounds, retains unresolved answer conflicts, or has a blocking confidence or answer-cue result. Missing candidates do not block a complete manually entered schema.
10. Exercise detail for a student returns only the active confirmed question assets and never returns pending assets, answer candidates, source evidence, Answer PDF metadata, or correct answers.
11. Submission creation rejects a student-ready start when no confirmed active set exists and pins the active set ID on success.
12. Take and review responses resolve assets from the submission's pinned set, not from a later active set.
13. Generated-asset delivery permits confirmed sets needed by active or historical submissions, uses immutable cache headers, and keeps pending assets teacher-only.
14. Deleting an exercise removes its asset and candidate metadata and attempts best-effort cleanup of its derived R2 objects. Failed pending generations are cleanable without touching the active set.

`jsonSuccess` and `jsonError` remain the response helpers for every Worker route.

## Consistency and safety invariants

- No generated set becomes student-visible before an authenticated teacher confirms the complete preview.
- A student's question image, answer schema, and answer control always use the same question ID and pinned asset set.
- The current exercise schema cannot diverge from the immutable snapshot attached to its active question asset set.
- Activation changes the complete set or changes nothing; students never observe a mixed generation.
- Regeneration failure never removes or mutates the current active set.
- Replacing a pending question with a screenshot changes only that question in that pending set.
- A teacher screenshot cannot activate until the teacher previews its image as part of the complete set.
- New submissions cannot start without a confirmed set after cutover.
- Answer PDF parsing and green-highlight extraction never write grading answers directly; only the teacher-confirmed final schema does.
- No automatic answer source takes silent precedence; unresolved key, type, or value conflicts block activation.
- A successful answer suggestion never clears an answer-leak failure from the corresponding student image.
- Replacing either source PDF makes a pending combined review stale until it is regenerated.
- Candidates, marked evidence, teacher-only answer files, and `correct_answer` values are never returned to the question-boundary vision detector or student routes.
- Active-attempt responses do not expose correct answers; detailed review keeps the existing post-submission visibility rules.
- Student routes do not request or render the source exercise PDF after cutover.

## Legacy migration

Existing exercises have no active asset set. Rollout must therefore separate generation from student cutover.

1. Ship the storage and teacher generation path while the current student fallback still exists.
2. Add **Prepare exercise** to existing teacher exercise pages. It reuses the current schema and Answer PDF when available, then adds automatic boundary, highlight, and candidate comparison.
3. Use exercise 9 as the first acceptance fixture because it covers a born-digital multi-page PDF, green-highlighted answer evidence, and inline solution sections.
4. Generate and confirm sets for every student-visible exercise. Production generation or confirmation requires Chinh's separate approval.
5. Populate existing submission pointers with the confirmed set that represents their current exercise source, preserving the current best-known review behavior.
6. Enable the student cutover only when every student-visible exercise is ready.
7. Remove the legacy student iframe fallback. After this gate, an exercise without an active confirmed set is hidden from student lists and cannot start a submission; its teacher page shows the recovery action.

## Delivery plan

### Stage A — Persistence and atomic contracts

**Agent actions**

- Add failing migration, repository, and route tests for asset sets, ordered segments, active pointers, submission pinning, authorization, validation, and atomic activation.
- Add the D1 migration, update `docs/schema.dbml`, implement the minimum Worker contracts, and add R2 cleanup behavior.
- Keep the existing student rendering path unchanged.

**Chinh actions**

- Review the persisted data and activation boundary; no visual approval is needed yet.

**Expected outcome**

- Pending and confirmed generations can coexist, and no partial generation can become student-visible.

**Go gate:** migration rollback/reapply works locally; route and integration tests prove authorization, completeness, pinning, and old-set preservation on failure.

### Stage B — Automatic generation and teacher confirmation

**Agent actions**

- Add failing detector tests for born-digital, scanned, multi-page, Vietnamese/English marker, and inline-solution fixtures.
- Implement text-geometry candidate detection, gated vision fallback, validation, WebP rendering, optional best-effort text extraction, upload progress, complete-set preview, per-question screenshot replacement, retry, and confirm-and-activate.
- Keep manual crop editing out of the interface.

**Chinh actions**

- Review generated exercise 9 crops and confirm that answer-highlighted images are blocked.
- Confirm that the one-action safety review is understandable and that the full teacher PDF remains available.

**Expected outcome**

- Teachers can automatically generate and safely activate a complete question set without splitting the PDF, and can replace one rejected generated question with a screenshot.

**Go gate:** exercise 9 acts as a safety fixture: generated crops are complete, its answer-highlighted questions reliably block activation, and other low-confidence or incomplete fixtures cannot activate. A clean representative teacher PDF will be validated before student cutover.

### Stage B2 — Unified answer-key preparation and sanitization

**Agent actions**

- Add failing fixtures for Answer PDF omission, Answer PDF/green agreement and conflict, multiple-choice/true-false/numeric highlight mapping, annotation and embedded-pixel highlights, missing and unparseable values, and legitimate green question content.
- Integrate the existing Answer PDF parser and deterministic green extractor as candidate adapters behind one preparation action and answer table.
- Persist teacher-only candidate provenance, implement conservative highlight sanitization and residual-cue checks, and require the teacher to resolve key, type, and value mismatches before activation.
- Preserve manually entered answers and the existing manual fallback; keep student photo-answer extraction unchanged.

**Chinh actions**

- Review exercise 9's Answer PDF candidates, green-highlight candidates, agreement/conflict states, and cleaned question images in one workflow.
- Confirm that source labels and conflict recovery are understandable and that cleaned images preserve every character, formula, and diagram without revealing the answer.

**Expected outcome**

- Teachers prepare one answer key from both automatic sources plus manual corrections, while no unresolved answer conflict, marked image, or damaged image can reach students.

**Go gate:** identical source values merge, omissions remain visible, disagreements block until teacher resolution, every supported highlight candidate matches its known answer, sanitization removes only validated answer backgrounds, and no candidate affects grading before teacher confirmation.

### Stage C — Backfill and readiness

**Agent actions**

- Add the existing-exercise generation action and readiness indicators.
- Inventory student-visible exercises and prepare a production backfill checklist without mutating production.
- Verify that failed or abandoned generations leave current student behavior unchanged.

**Chinh actions**

- Approve any production backfill separately.
- Confirm every production preview before activation.
- Approve the cutover only when the readiness report has no missing active set.

**Expected outcome**

- Every student-visible exercise has one teacher-confirmed active set before the full-PDF fallback is removed.

**Stop gate:** any missing question, visible solution, unreadable crop, or unconfirmed exercise.

### Stage D — Question-first student experience

**Agent actions**

- Add failing take/review interaction tests before replacing the iframe.
- Build synchronized desktop and mobile question workspaces using the pinned asset set.
- Preload adjacent images, preserve timer/input/submission behavior, remove student PDF controls, and add English/Vietnamese copy.
- Update `PRODUCT.md` and `CHANGELOG.md` only when the behavior ships.

**Chinh actions**

- Review take and detailed-review flows at desktop and mobile widths in both languages.
- Confirm that question switching feels at least as direct as the legacy LMS while retaining SmartClass's design system.

**Expected outcome**

- Students see one isolated question and its matching answer controls with no source-PDF request or independent scroll-position problem.

**Go gate:** all acceptance criteria and required frontend, Worker, integration, build, keyboard, mobile, and visual checks pass.

## Verification plan

### Detector and candidate-merger unit tests

- Vietnamese `Câu N` and English `Question N` markers.
- Inline `Lời giải`, `Solution`, and answer-section exclusion.
- Questions that cross pages or contain multiple segments.
- Shared stimuli and diagrams.
- Scanned/image-only fallback responses.
- Missing IDs, unexpected IDs, duplicate segments, invalid rectangles, and low confidence; missing extracted text remains non-blocking.
- Embedded visual answer cues, clipped top edges, structural-heading ownership, mathematical text loss, and diagram-only segments.
- Green-highlighted multiple-choice, true/false, and numeric answers; zero, duplicate, conflicting, and unparseable highlights abstain.
- Annotation highlights, embedded-pixel highlights, antialiased edges, legitimate green diagrams, foreground preservation, and residual-cue blocking.
- Answer PDF and green candidates that agree, disagree, omit a question, return an unexpected question, or use incompatible types.

### Worker and integration tests

- Teacher-only creation, upload, preview, confirmation, replacement, and cleanup.
- Teacher-only screenshot replacement changes one pending question, validates its image, and leaves the active set unchanged.
- Pending assets are unavailable to students.
- Activation validates against the proposed schema and uses one D1 batch.
- Answer candidates and source evidence remain teacher-only, malformed candidates are rejected, candidate conflicts block, and missing candidates can be replaced by valid manual answers.
- Replacing either source PDF invalidates its pending combined review without changing the active set.
- A failed replacement retains the prior active set.
- A submission pins its set and continues using it after a later exercise replacement.
- Student responses still omit correct answers before submission.
- Submission start is blocked when the exercise has no confirmed active set after cutover.

### Frontend tests

- One selection action changes the question heading, all left-panel segments, right-panel answer controls, progress, and navigation state.
- Previous, Next, desktop grid, and mobile sheet use the same selection behavior.
- Selecting a question resets/focuses the workspace without smooth body scrolling.
- Adjacent images preload without fetching every exercise image up front.
- Teacher confirmation stays disabled for blocking detector results.
- One preparation action runs both available answer sources and question-image generation.
- Teacher review distinguishes source agreement, Answer PDF-only, green-only, conflicting, missing, and manually entered answers without silently overwriting a value.
- The final action confirms both the complete answer schema and the answer-free student images.
- Rejecting a generated question offers retry, screenshot upload, and full-PDF replacement; a valid screenshot resolves only that question.
- Retry and failed upload preserve the old active set.
- No student take or review test mounts an iframe or requests the source exercise PDF.
- English and Vietnamese resource trees remain in parity.

### Manual and visual checks

- Exercise 9's combined Answer PDF/green evidence, merged answer table, and cleaned previews at 1440 × 1000 and 390px mobile widths.
- Long, short, multi-page, diagram-heavy, and scanned questions.
- Keyboard navigation, visible focus, screen-reader text, 48 × 48 touch targets, dark/light themes, and reduced motion.
- Slow and failed image requests, detector failure, upload failure, stale generation, and no-active-set recovery.
- Full teacher PDF viewing remains available.

## Acceptance criteria

- A teacher uploads one exercise PDF; no per-question PDF preparation is required.
- A teacher may add one Answer PDF or complete missing answers manually; these are paths through the same preparation workflow, not separate publishing flows.
- SmartClass automatically detects all expected question regions in a supported born-digital PDF.
- Existing Answer PDF extraction and green-highlight extraction feed one normalized, editable answer table with visible provenance.
- Matching candidates show agreement; single-source candidates identify their source; conflicts and missing rows remain visible until the teacher resolves them.
- SmartClass suggests a correct answer when exactly one supported green highlight maps unambiguously to the declared multiple-choice, true/false, or numeric schema.
- Missing, duplicate, conflicting, or unparseable highlights produce no answer suggestion and never guess.
- Existing correct answers are not silently overwritten; no source takes automatic precedence, and the teacher reviews or edits the complete final answer schema before activation.
- A green-highlighted student region is activated only after the answer background is safely removed, answer-cue detection passes again, and the teacher confirms the clean preview.
- Any uncertain sanitization remains blocked and offers question screenshot or PDF replacement.
- A scanned/image-only PDF uses question screenshots or replacement until an approved vision model passes the detection gate.
- A complete visual preview requires explicit teacher confirmation before activation.
- Missing, invalid, or low-confidence generations cannot activate.
- A teacher can reject one generated question and replace it with one complete screenshot without replacing the source PDF.
- The screenshot replaces only the selected pending question and is reviewed as part of the complete visual preview before activation.
- Students do not fetch, mount, or display the source exercise PDF on take or detailed-review routes.
- The left panel shows only the current question's ordered segment(s).
- The right panel shows only the matching answer controls plus stable navigation, timer, and submit actions.
- Selecting any question updates both panels together and makes the selected question immediately visible.
- Desktop and mobile flows have one predictable content position rather than independent PDF and form positions.
- New asset sets activate atomically; failed replacements leave the previous set available.
- In-progress and historical submissions keep the asset set pinned when they started.
- Exercise 9 exposes an omitted Answer PDF row, source agreement or disagreement, supported highlight candidates, and clean previews; unresolved or unsafe cases remain blocked.
- Teachers can still view the complete source PDF.
- Existing exercises are backfilled and confirmed before the legacy student PDF path is removed.

## Risks and follow-ups

| Risk | Mitigation |
| --- | --- |
| Automatic crop contains a solution | Detect exclusion markers and answer highlights, block uncertainty, show every crop, and require teacher confirmation. |
| Answer PDF parsing omits or misreads a row | Compare its key set and values with exercise-PDF markers and green candidates, expose gaps or conflicts, and require teacher resolution. |
| Answer sources disagree | Show both values and provenance, apply no automatic precedence, and block activation until the teacher chooses or edits the final value. |
| A green mark maps to the wrong answer | Require one deterministic schema-valid mapping, abstain on ambiguity, show teacher-only evidence, and keep the teacher-confirmed schema authoritative. |
| Highlight removal damages text or legitimate green content | Limit changes to validated answer-background masks, preserve foreground pixels, re-run cue detection, show the cleaned preview, and block uncertain results. |
| Scanned PDFs produce weak boundaries | Keep vision output disabled until a model passes the proof-of-concept gate; offer question screenshots or PDF replacement. |
| One generated question is unsafe but the source PDF is otherwise usable | Let the teacher replace that pending question with one reviewed screenshot. |
| Question crosses pages or uses shared material | Store ordered multi-segment questions rather than one fixed crop. |
| Replacement changes an active attempt | Use immutable generations and pin the generation on submission creation. |
| Many derived files increase storage and upload time | Use bounded WebP output, limited parallel uploads, progress, immutable caching, and stale-pending cleanup. |
| Image-only questions are not fully accessible | Optional PDF text extraction is not an accessible equivalent because it can omit formulas and diagrams. A complete accessible representation remains deferred work and is not an activation condition. |
| Automatic detection cannot handle an important source | Stop activation and collect the fixture; a bounded crop editor is a follow-up, not a hidden unsafe override. |

Teacher screenshot replacement is part of the first release. A crop editor that modifies normalized PDF bounds remains a possible follow-up only after real failure evidence; it is not pre-approved by this RFC.
