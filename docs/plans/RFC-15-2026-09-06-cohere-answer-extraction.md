---
rfc: RFC-15
title: Cohere answer extraction
date: 2026-09-06
status: Accepted
dependencies: [RFC-5, RFC-11, RFC-13]
---

# RFC: Cohere answer extraction

## Implementation status

The code migration is complete. Cohere Parse v5 now handles Answer PDF extraction and the retained student answer-photo API. DeepSeek has no remaining runtime path or model-selection API. The deprecated `exercises.extract_model` storage column remains temporarily for deployment compatibility, but current code does not read or write it.

Production cutover is not complete. No corpus path has been supplied for the holdout gate of 20 distinct, approved Answer PDFs. The production Cohere secret, provider terms review, and deployment also remain unverified.

## Trigger

Parsing one representative Answer PDF took 87.7 seconds from the teacher's click to an editable answer table. DeepSeek used 86.53 seconds of that time. PDF.js extraction took about 0.83 seconds in the browser, and applying the API response took about 0.34 seconds.

The workflow is slow because DeepSeek interprets the complete extracted document as a language-model prompt. The required answers already appear in compact tables. SmartClass needs table recognition, validation, and section mapping rather than open-ended reasoning.

## Evidence

A local proof of concept tested Cohere Parse v5 on the 3 answer-table pages from a 13-page, 851,449-byte Vietnamese Answer PDF. The page render used 150 DPI PNG images. It sent the 3 images concurrently.

| Run | Render | Cohere OCR | Total | Exact answer cells |
| --- | ---: | ---: | ---: | ---: |
| 1 | 0.684s | 7.182s | 7.867s | 34 of 34 |
| 2 | 0.657s | 7.370s | 8.027s | 34 of 34 |
| 3 | 0.665s | 7.260s | 7.925s | 34 of 34 |

The median total was 7.925 seconds. This was about 11 times faster than the DeepSeek workflow and reduced wall time by about 91%.

The 34 expected values covered:

- 12 multiple-choice answers
- 16 true or false sub-answers
- 6 numeric answers, including decimal commas and negative values

Cohere returned every answer cell correctly in all 3 runs. This proves repeatability on one document, not accuracy across document layouts. Cohere also made several accent and spelling errors in surrounding Vietnamese prose. The migration must therefore use Cohere for table structure and cells, not for section titles or prose interpretation.

Cohere's public Parse API currently accepts images through `POST /v2/parse`. It does not accept a PDF through the documented request schema. Parse v5 returns Markdown and HTML tables, not SmartClass schema JSON or confidence scores. Cohere lists Vietnamese as a zero-shot language rather than a stable language. These limits shape the design.

## Cost estimate

Prices were checked on 6 September 2026. [Cohere prices Parse at $1.50 per 1,000 pages](https://cohere.com/blog/parse). [DeepSeek prices V4 Flash by tokens](https://api-docs.deepseek.com/quick_start/pricing/):

- off-peak: $0.22 per 1 million cache-miss input tokens and $0.66 per 1 million output tokens
- peak: $0.44 per 1 million cache-miss input tokens and $1.32 per 1 million output tokens

DeepSeek may cache the static instruction prefix, but each Answer PDF contributes different source text. Use cache-miss pricing for a conservative estimate until the API reports actual cache usage.

The representative DeepSeek request contained 17,804 extracted text characters and 3,868 words before the schema prompt. Its 34-row JSON response was not retained with API usage metadata. The estimate therefore assumes 7,000 to 10,000 input tokens and 2,000 to 3,000 output tokens.

| Cost | Cohere Parse v5 | DeepSeek V4 Flash |
| --- | ---: | ---: |
| One representative PDF, off-peak | $0.0045 | $0.0029 to $0.0042 |
| One representative PDF, peak | $0.0045 | $0.0057 to $0.0084 |
| 1,000 representative PDFs, off-peak | $4.50 | $2.90 to $4.20 |
| 1,000 representative PDFs, peak | $4.50 | $5.70 to $8.40 |

The Cohere estimate assumes the selector sends only 3 answer-table pages: 3 × $1.50 ÷ 1,000 = $0.0045. Sending all 13 pages would cost $0.0195 per PDF. Candidate-page selection is therefore a cost control as well as a latency control.

The DeepSeek range uses visible input and output estimates. The former request did not disable DeepSeek's default thinking mode. Thinking output may have increased billed output beyond this range. No matched API `usage` baseline was retained before removal, so this estimate remains an assumption.

The migration is justified by the measured latency reduction, not guaranteed cost savings. The listed estimates remain below one cent per representative request before any unmeasured DeepSeek thinking output.

## Decision

SmartClass replaces DeepSeek completely with Cohere Parse v5 for Answer PDF schema generation and the retained student answer-photo API. The application has one extraction provider and no DeepSeek runtime dependency.

The browser will use PDF.js to find and render candidate answer-table pages. The Worker will send those page images to Cohere with a maximum concurrency of 3. The Worker will parse only HTML table blocks from Cohere's Markdown response. It will then normalize and validate the rows through SmartClass's existing schema rules.

SmartClass will keep the current teacher-review boundary. Cohere Answer PDF output remains an answer candidate. It never becomes the grading authority until a teacher confirms and activates the complete answer schema.

The student answer-photo route will use a separate deterministic adapter constrained by the submission's pinned schema. When Cohere loses the table structure, the adapter will return null answers and a warning. Manual entry is the accepted first-release recovery path for rotated or perspective-distorted photos.

This RFC supersedes RFC-11 only for the `answer_pdf_text` extraction method and its confidence source. RFC-11 remains authoritative for candidate merging, green-highlight extraction, teacher review, activation, and answer-evidence privacy. It supersedes RFC-5 for the student-photo provider, model selection, and confidence contract. RFC-5 remains authoritative for endpoint ownership, upload validation, storage, and schema-shaped output. RFC-13 remains authoritative for section identity and global `q_id` assignment.

## Progress feedback

Use a 15-second progress horizon for Cohere-powered loading states. This is the rounded 10-second observed median multiplied by 1.5. The extra time reduces how often a normal request appears stalled.

The progress bar is an estimate, not provider-reported completion. It must behave as follows:

- use actual page-reading, rendering, and upload events for the work the client can measure
- advance through the Cohere wait stage towards 90% over 15 seconds
- finish immediately when the response arrives, even when it arrives before 15 seconds
- never reach 100% before the response has been parsed and applied
- hold at 90% after 15 seconds and change the status to **Still reading answers**
- move to an error state when the request fails instead of restarting the animation
- expose the current stage through `aria-valuetext` without announcing every percentage change
- replace continuous animation with discrete stage changes under `prefers-reduced-motion`

Apply this behavior to both teacher Answer PDF workflows. Reuse it if the student photo-upload interface returns. Recalculate the horizon only from measured production latency, not from individual slow requests.

## Scope

This migration replaces both former DeepSeek call sites:

- Answer PDF schema extraction
- student answer-photo extraction through `POST /api/submissions/:id/extract`

It does not change:

- Exercise PDF question detection or image generation
- deterministic green-highlight extraction
- final answer-schema validation or grading
- teacher confirmation and atomic activation
- direct answer entry in the shipped student interface
- scanned or image-only PDF support

This RFC does not restore the removed student photo-upload interface. It migrates the retained backend contract and removes DeepSeek completely.

## Student answer-photo evaluation

The current student interface uses direct answer entry and no longer exposes photo upload. Before this migration, the authenticated `POST /api/submissions/:id/extract` route and its DeepSeek vision call remained in the backend.

The Answer PDF proof of concept cannot validate this path. Answer PDFs contain clean printed tables. Student photos may contain handwriting, corrections, skew, perspective, shadows, glare, blur, cropping, and ambiguous marks. The former DeepSeek call received the pinned schema as prompt guidance. Cohere Parse returns document Markdown and has no documented prompt or schema-guidance field.

### Synthetic proof of concept

A live Cohere Parse v5 experiment used one controlled synthetic answer sheet with 10 expected cells:

- 4 multiple-choice answers
- one true or false question with 4 sub-answers
- 2 numeric answers, including a negative decimal

The experiment rendered one clean image and 4 camera-like variants. The handwritten-like fixture used generated text and programmatic marks, not natural handwriting. The clean fixture also contained one overlapping section heading. There were no real student photos.

| Synthetic image | Exact | Incorrect emitted answers | Abstentions | Latency |
| --- | ---: | ---: | ---: | ---: |
| clean reference | 10 of 10 | 0 | 0 | 9.485s |
| blur, low contrast, and noise | 10 of 10 | 0 | 0 | 10.930s |
| perspective and 3.2° rotation | 0 of 10 | 0 | 10 | 10.750s |
| reduced 630 × 840 JPEG | 10 of 10 | 0 | 0 | 3.532s |
| uneven shadow and handwritten-like marks | 10 of 10 | 0 | 0 | 10.594s |
| total | 40 of 50 | 0 | 10 | 10.594s median |

Cohere billed one page for each image. The 5 scored requests cost about $0.0075 at $1.50 per 1,000 pages. A separate schema-guidance probe brought total experiment billing to 6 pages, or about $0.009.

A conservative deterministic adapter mapped intact HTML tables into the current MCQ, true or false, and numeric answer shape. It emitted no answer when the perspective-distorted response corrupted the table structure. This prevented false accepts but lost the complete sheet.

The proof-of-concept adapter used `confidence: null` because Cohere provides no score. At that time, the validator converted each null to `0`. This was mechanically compatible but did not preserve the endpoint's numeric model-confidence meaning.

The schema-guidance probe sent an undocumented `expected_schema` field. Cohere returned HTTP 200, but its normal Markdown response gave no evidence that the field was used. Treat schema guidance as unsupported.

### Accepted student-photo trade-off

SmartClass replaces DeepSeek in the retained student-photo route despite the synthetic perspective failure. The first Cohere release prefers safe abstention over coverage. A distorted sheet may return no extracted answers. The client must keep the student's existing manual answers and show a retry or manual-entry warning.

The route preserves its authentication, ownership, submission-state, image-type, 20 MiB size, R2 storage, and pinned-schema rules. The provider and parsing steps are:

1. Send the uploaded image to Cohere Parse v5 without unsupported schema fields.
2. Parse only recognized HTML table shapes.
3. Match every result against the pinned `(q_id, sub_id, type)` shape after OCR.
4. Drop and warn on unknown, duplicate, conflicting, invalid, or structurally ambiguous cells.
5. Return one ordered result for every pinned schema row. Use `answer: null` for every missing result.

Set `model_used` to `parse-v5.0`. Exercise-level model selection is removed because one provider and one model remain. The route ignores any student-supplied model field.

Return `confidence: null` for every Cohere result. The student-photo response contract and validator accept `number | null`. Any future review interface must do the same. Do not convert null to zero or show a percentage.

The initial student-photo cutover must pass these checks:

- the clean, blur, reduced-JPEG, and shadow synthetic fixtures each return 10 of 10 exact answers
- the perspective fixture returns 10 null answers, one structural warning, and 0 incorrect answers
- malformed, pipe-only, out-of-schema, duplicate, and conflicting OCR output cannot emit an answer
- every response preserves the complete pinned schema order
- a Cohere timeout or provider error remains a recoverable extraction failure
- logs contain no raw OCR output, student answer, image data, or authorization data

Perspective correction and real-photo evaluation are deferred rather than cutover gates. The follow-up must add document detection, orientation correction, and perspective correction. It must then compare Cohere against human-labelled answers from at least 16 consented real photos covering handwriting, corrections, varied marks, repeated section numbering, camera defects, cropping, and ambiguous cells. The target remains 0 incorrect emitted answers and at least 95% coverage of readable cells.

Raw model-output logging is removed from the parse-error path because raw output may contain student answers.

## Parsing pipeline

### 1. Read the Answer PDF once

Extend the existing lazy PDF.js boundary in `src/lib/pdf.js`. One PDF load must produce ordered page text and the selected page images. Do not load the PDF separately for text extraction and image rendering.

Normalize page text for detection without changing the original Unicode text. Keep the original text for section titles and source evidence.

### 2. Select candidate pages

Select a page when its normalized PDF.js text contains a supported answer-table heading or a supported compact table signature. Heading matching must tolerate case, spacing, and Vietnamese diacritics. Include the next page when a table may continue across a page boundary.

Selection must favour recall over minimum page count. An extra page increases cost slightly. A missed table forces silent manual work.

The selector must report an unsupported document when it finds no candidate page. This preserves RFC-11's manual recovery for scanned or unreadable PDFs. It must not send every source page to Cohere as an unbounded fallback.

### 3. Render bounded page images

Render candidate pages at 150 DPI as PNG. Preserve the full page because table headers and section context determine row meaning.

Apply these request limits before calling the Worker:

- no more than 10 candidate pages
- no image larger than 3 MiB
- no multipart request larger than 25 MiB

If a document exceeds a limit, stop and ask the teacher to enter the answer key manually. Do not lower image quality silently.

### 4. Send page images to the Worker

Keep `/api/exercises/schema/parse` as the teacher-authenticated route. The route accepts multipart data for Cohere. It no longer accepts the former DeepSeek JSON request with `source_text`.

The multipart request contains:

- repeated `page` PNG files
- `page_manifest`, a JSON array with each file name, 1-based source page number, and original PDF.js page text
- optional `expected_question_count`
- optional `schema_shape`, containing answer-free question descriptors when an exercise schema already exists

The browser must send multipart data through `request()` in `src/lib/api.js`. It must let the browser set the multipart boundary. XHR is not needed because the current interface does not show upload progress for this short request.

Reject duplicate page numbers, missing files, unsupported media types, out-of-order manifest entries, and all size-limit failures before any Cohere request starts.

### 5. Call Cohere with bounded concurrency

Add one server-side Cohere client for `parse-v5.0`. The Worker will convert each validated image to a data URL and call `POST https://api.cohere.com/v2/parse`. Run no more than 3 calls concurrently.

The client must:

- require `COHERE_API_KEY`
- stop each page request after 15 seconds
- treat a timeout, non-2xx response, malformed response, or missing table block as a page failure
- return page-scoped Markdown and provider timing to the route
- avoid logging image data, OCR output, authorization headers, or Answer PDF text

Do not retry a failed provider request automatically in the first release. The teacher can retry the complete parse. This avoids duplicate cost and long tail latency while retry behaviour is still unmeasured.

### 6. Parse supported table shapes

Parse HTML table blocks from Cohere's Markdown with deterministic adapters. Ignore surrounding OCR prose.

Support these shapes:

- multiple choice: local question number to `A`, `B`, `C`, or `D`
- true or false: local question columns crossed with `a` to `d` rows and Vietnamese `Đ` or `S` values
- numeric: local question columns crossed with one answer row

Normalize OCR `D` to Vietnamese `Đ` only inside a recognized true or false answer cell. Normalize `Đ` to `1` and `S` to `0`. Apply the existing numeric normalization for decimal commas, signs, and number strings. Do not correct arbitrary Vietnamese prose.

Reject a table block when its row and column labels do not map uniquely. Keep valid blocks from other pages so the teacher can recover missing rows manually.

### 7. Preserve question identity

Use ordered PDF.js page text for section titles. Cohere OCR prose must not replace those titles.

Assign `section_key` by section order. Map each table's local number to `(section_key, local_number)`. Assign global `q_id` in document and section order. A local number may restart in another section but may not repeat within one section.

When an existing schema shape is present, match on `(section_key, local_number, sub_id)`. Take `q_id`, type, and source descriptors from that shape. Cohere must not redefine an existing question identity.

When only `expected_question_count` is present, reject unexpected identities and leave missing identities for manual completion. Keep RFC-13 validation as the final authority.

### 8. Keep Cohere candidates unscored

Cohere Parse v5 does not provide confidence scores. SmartClass must not invent a probability.

Set `confidence` to `null` for a structurally valid and uniquely mapped Cohere row. Return its proposed answer for teacher review.

Emit no answer candidate when the table shape, question identity, type, answer value, duplicate handling, or section mapping is invalid or ambiguous. Return an identified schema row with an empty answer when manual completion is possible.

Missing PDF.js answer evidence is not a disagreement. PDF.js supplies page selection, section titles, and question identity. Cohere supplies table structure and answer cells. A positive disagreement with an existing teacher answer or a green-highlight candidate remains a conflict under RFC-11.

The 0.75 threshold does not apply to Cohere rows. Keep confidence thresholds only for sources that return a numeric confidence score.

Persist nonblank Cohere rows as `answer_pdf_text` candidates despite their null confidence. Add a D1 migration so `confidence` is nullable for `answer_pdf_text` and remains required from 0 to 1 for scored sources. Update `docs/schema.dbml` in the same change.

Show a null value as **Unscored, review required**. Never render it as 100% or low confidence. Final answer-schema persistence and grading remain unchanged because they do not use candidate confidence.

Do not add a second PDF.js answer-table parser only to produce a confidence score. Reconsider that choice only if a blind holdout test finds incorrect Cohere candidates and a PDF.js parser catches every error while retaining at least 95% coverage. If PDF.js alone meets the same accuracy and coverage gates, remove Cohere rather than maintaining 2 answer parsers.

### 9. Return a nullable confidence contract

Return the current response shape:

```json
{
  "schema": [],
  "warnings": [],
  "confidence": null,
  "model_id": "parse-v5.0",
  "timings_ms": {
    "provider": 0,
    "parse": 0,
    "total": 0
  },
  "pages_processed": 0
}
```

For Cohere responses, define `schema[].confidence` as `null` and do not convert it to zero during normalization. Add one warning that Cohere does not provide confidence scores and that the teacher must review every extracted answer. Add page-specific warnings for provider failures, unsupported tables, conflicts, and missing rows. Do not return raw OCR output or page images.

## Failure and privacy rules

- only a teacher may call the parser
- only the submission owner may call the student-photo extractor for an in-progress submission
- Answer PDF images, text, and OCR output stay out of student routes
- student answer-sheet images keep their existing R2 and `submission_files` retention behavior
- provider failures leave recoverable manual rows rather than guessed answers
- one malformed page must not discard valid rows from another page
- duplicate or conflicting keys must remain blocking conflicts
- request and error logs must contain timing, page count, status, and error category only
- the Worker must not persist rendered pages or raw Cohere responses

## Implementation and release plan

Phases 1 to 4 and the runtime removal in Phase 6 are complete in code. Phase 5 remains a production release gate.

### Phase 1. Build the deterministic core

1. Add failing tests for candidate-page selection and the 3 table adapters.
2. Add golden Cohere responses for multiple-choice, true or false, and numeric tables.
3. Add student-photo golden responses for intact and perspective-corrupted tables.
4. Implement separate Answer PDF and student-photo adapters with shared cell normalization.
5. Implement structural abstention and nullable Cohere confidence.
6. Test repeated local numbering, OCR `D` or `Đ`, decimal commas, negative numbers, malformed tables, extra cells, missing cells, and conflicts.

Completion criterion: all Answer PDF fixtures produce exact candidates, and all student-photo fixtures produce exact answers or explicit nulls without an incorrect answer.

### Phase 2. Add the Cohere route

1. Add multipart validation and teacher-only integration tests.
2. Add the Cohere client with a 3-request concurrency limit and 15-second page timeout.
3. Return the existing schema response plus model, page count, and timing metadata.
4. Remove the JSON DeepSeek branch after switching both callers to multipart data.
5. Add a D1 migration that makes `answer_pdf_text` candidate confidence nullable, then update `docs/schema.dbml`.

Completion criterion: mocked integration tests cover success, nullable confidence, partial page failure, timeout, malformed response, missing key, authentication, and every payload limit.

### Phase 3. Switch both teacher workflows

1. Change exercise creation to read and render the Answer PDF once.
2. Change question-asset preparation to use the same helper and multipart API.
3. Persist unscored Cohere rows as answer candidates without applying the 0.75 threshold.
4. Preserve manual entry, candidate merging, section validation, and green-highlight candidates.
5. Show **Unscored, review required**, the 15-second estimated progress behavior, and recovery states in English and Vietnamese.

Completion criterion: both workflows produce the same schema and candidate behavior from one Answer PDF.

### Phase 4. Switch the student-photo route

1. Replace `requestAnswersFromImage` with the shared Cohere Parse client.
2. Parse the result through the student-photo adapter and pinned schema.
3. Return nullable confidence and `model_used: "parse-v5.0"`.
4. Preserve authentication, ownership, submission state, upload limits, R2 storage, and complete ordered output.
5. Remove raw model output from every log path.
6. Keep malformed and perspective-corrupted tables recoverable through null answers and manual entry.

Completion criterion: the saved synthetic fixtures meet the accepted student-photo checks, and all existing route safety tests pass with Cohere responses.

### Phase 5. Validate before production release (pending)

Run live parses against at least 20 distinct, approved holdout Answer PDFs. The set must cover every supported table shape, section-local numbering, decimal commas, negative values, and different source layouts. Record per-stage timing, exact emitted answers, abstentions, incorrect candidates, and pages billed.

This gate is pending because no approved corpus path has been supplied. The proof-of-concept document and synthetic student-photo fixtures do not satisfy this gate.

Cut over only when:

- the Gia Bình fixture returns all 34 answer cells correctly in 3 consecutive runs
- every supported holdout fixture has 0 incorrect emitted candidates
- supported holdout fixtures emit at least 95% of expected answer cells
- a 3-page parse has median end-to-end latency at or below 10 seconds
- a 3-page parse has p95 end-to-end latency at or below 15 seconds
- client rendering takes at most 1.5 seconds at p95
- no answer evidence appears in a student response, asset, or log
- manual recovery works for every unsupported or failed document

After the gate passes, release the multipart frontend and Cohere Worker as one coordinated change. The implementation has no DeepSeek compatibility branch. This RFC does not record a completed production deployment.

### Phase 6. Remove the DeepSeek runtime (complete)

The implementation completed these code and configuration changes:

1. Removed JSON `source_text` handling from `/api/exercises/schema/parse`.
2. Removed `worker/lib/deepseek.js`, both DeepSeek request functions, and their tests.
3. Removed `worker/lib/extract-models.js` and the model-list endpoint.
4. Removed `extract_model` from exercise APIs, frontend payloads, seeds, and tests.
5. Stopped reading and writing `exercises.extract_model`. The nullable column remains temporarily so applying migrations before deploying the new Worker cannot break the old Worker.
6. Removed current DeepSeek runtime guidance and configuration from the repository.

The code meets the runtime completion criterion: no executable path requires DeepSeek. Both extraction paths use Cohere Parse v5. The deprecated database column is inert and can be removed in a later contract migration after the Cohere Worker is deployed. Historical RFC, changelog, test-fixture, and migration references remain valid evidence.

The production DeepSeek Worker secret may still exist. Remove it only with explicit approval after production cutover. This secret cleanup does not restore or change a runtime path.

## Credentials and deployment

Local development and production need `COHERE_API_KEY`. Store only a 1Password reference in local credential files. Resolve it when Wrangler starts. Never write the plaintext value to the repository, generated artifacts, logs, or test snapshots.

The `smartclass-cohere` Agent Secrets bundle is not yet provisioned. Add `COHERE_API_KEY` to that bundle before live local verification. Keep the wrapper limited to its fixed local `wrangler dev --local` command and credential probe.

Adding the production Cloudflare Worker secret and deploying the migration change shared state. Perform those actions only with explicit approval.

Before production cutover, confirm that Cohere account settings and current API terms meet SmartClass's requirements for Answer PDF retention, model training, and geographic processing. Record that decision in the implementation pull request.

## Verification

Implementation must add or update these tests before changing behavior:

- PDF helper unit tests for ordered page text, selection, continuation pages, and render limits
- deterministic parser unit tests for every supported table shape and normalization rule
- schema route integration tests for auth, multipart validation, provider failures, partial success, nullable confidence, warnings, timing metadata, and response normalization
- candidate persistence tests for nullable `answer_pdf_text` confidence and scored green-highlight confidence
- teacher creation tests for unscored rows, abstentions, failure recovery, and manual editing
- question-asset workflow tests for unscored candidate provenance, section mismatch, green-highlight merging, conflicts, and parser failure
- progress tests for early completion, the 15-second 90% hold, failure, accessible stage text, and reduced motion
- student-photo adapter tests using every saved synthetic response, including complete abstention on perspective corruption
- student-photo route tests for auth, ownership, state, image limits, R2 persistence, pinned-schema mapping, nullable confidence, provider failure, and safe logs
- exercise API and migration tests proving `extract_model` is removed
- student-route tests proving that OCR text, images, and answers never leak
- live benchmark runs for latency, exact candidate emission, abstention, and cost

Before opening the application-change pull request, run `npm test`, `npm run test:worker`, `npm run test:integration`, and `npm run build`. Complete the frontend acceptance checklist because both teacher workflows and progress states change.

## Rollback

Rollback requires reverting the complete frontend and Worker migration together. Do not add an automatic DeepSeek fallback to a Cohere request. Such a fallback could restore the 87-second delay without telling the teacher.

Manual answer entry remains the safe recovery path during rollback and for unsupported documents.
