# RFC: v0.4 — Image-based Answer Extraction (LLM, no OCR)

**Date:** 2026-05-03
**Status:** Draft
**Author:** lelouvincx + Amp

### Revision History

| Rev | Date       | Changes                                                                                                                                                                |
| --- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1  | 2026-05-03 | Initial draft. Replaces the OCR plan from the v0.4 roadmap with a vision-LLM approach via OpenRouter (Grok).                                                           |
| v2  | 2026-05-03 | Address review: add smooth upload/extract UX as explicit scope item; raise image cap to 20 MB; treat Grok as the default but make the model user-selectable in the UI. |

---

## Motivation

After v0.3, the core student loop is complete: students browse exercises, take them with the PDF in a split pane, submit, and review. The remaining piece for v0.4 is letting students submit **a photo of a filled answer sheet** instead of clicking A/B/C/D for every question.

The original roadmap left this open:

> v0.4 — Scanner & image upload (think again to decide whether to use an OCR or just yolo with grok because it's cheap)

This RFC closes that question. **We skip OCR (Tesseract.js) entirely and use a multimodal LLM (Grok via OpenRouter) to extract answers directly from the uploaded image.**

### Why not OCR?

| Concern                             | Tesseract.js                                                                      | LLM (Grok 4.1 Fast via OpenRouter)                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Handwriting**                     | Poor. Tesseract is tuned for printed text. Student answer sheets are handwritten. | Strong. Grok handles handwritten ticks/circles/letters well.                                                                |
| **Bundle size**                     | ~2 MB+ WASM + language data downloaded on first OCR. Hurts mobile.                | Zero client cost. Runs server-side.                                                                                         |
| **Layout understanding**            | None — produces a flat string. We'd need a second parser to map text → q_id.      | Native — we describe the schema in the prompt and the model returns structured JSON.                                        |
| **Schema awareness**                | Cannot use it.                                                                    | We pass the answer schema (q_ids, types, sub_ids) into the prompt; model fills in only the slots that exist.                |
| **Boolean sub-questions (a/b/c/d)** | Would require custom 2D layout parsing.                                           | Trivially expressed in the prompt.                                                                                          |
| **Cost**                            | Free (client compute).                                                            | Cheap. Grok 4.1 Fast vision is ~$0.20/1M input tokens; an answer-sheet image is ~1500 tokens → **~$0.0003 per submission**. |
| **Existing infra**                  | None.                                                                             | `worker/lib/openrouter.js` already exists, already used for teacher schema extraction, already has Gemini fallback.         |

The cost number is the key one: at $0.0003 per submission, a class doing 1000 submissions/month costs **$0.30/month**. Grok is, as the roadmap says, cheap enough to yolo.

### Why now (and not later)?

- Backend plumbing already exists (`requestSchemaFromOpenRouter` in [worker/lib/openrouter.js](file:///Users/lelouvincx/Developer/smartclass/worker/lib/openrouter.js)).
- Student upload endpoint slot already designed (`POST /api/submissions/:id/upload`, see [AGENTS.md](file:///Users/lelouvincx/Developer/smartclass/AGENTS.md) "Upload Endpoints"); never built.
- v0.3 review pages give us a UX precedent for showing "extracted vs. corrected" answers side by side.

---

## Scope

In:

1. Student uploads (or captures via camera) a photo of their filled answer sheet during a take session.
2. Worker proxies the image to the chosen vision model with the exercise's answer schema as context.
3. The model returns JSON of `{q_id, sub_id?, answer, confidence}` rows.
4. Frontend pre-fills the answer form with the extracted answers; student reviews and corrects, then submits normally.
5. Original image is stored in R2 indefinitely (auditable; same pattern as teacher uploads). It is not deleted on submit.
6. **Smooth upload + extract UX**: dropzone with drag-and-drop, image preview, progress states (uploading → extracting → done), error/retry states, replace-image action, side-by-side image-thumbnail-with-form on desktop. Treated as a first-class scope item, not polish — extraction can take 5–15 s and the UI must communicate clearly what's happening so the student doesn't think the page is frozen.
7. **User-selectable model** (front-end dropdown). Grok 4.1 Fast via OpenRouter is the default, but the student can pick from a small curated list (e.g., Grok 4.1 Fast, Gemini 2.5 Flash, GPT-4o-mini). The choice is sent with the extract request and forwarded to the provider. Selection is persisted to `localStorage` so it sticks across sessions.

Out (deferred):

- A "scanner" mode with live camera framing/edge detection. The basic file/camera input works; framing UI is polish for v0.6.
- Standardized printable answer-sheet template. Grok handles freehand layouts well enough that a template isn't required for v0.4. We may add an optional template later if accuracy on dense exams suffers.
- Auto-submit on extract. The student always reviews before submitting — extraction populates the form, never the submission row.

---

## Current state

| What                                                    | Status                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `worker/lib/openrouter.js`                              | Done. Text-based schema extraction for teacher uploads. Uses `x-ai/grok-4.1-fast`, Gemini fallback for retryable errors. |
| `OPENROUTER_API_KEY` in `.dev.vars` and Workers secrets | Configured.                                                                                                              |
| `POST /api/submissions/:id/upload`                      | **Missing.** Designed in AGENTS.md Upload Endpoints but never implemented.                                               |
| `submission_files` table                                | **Missing.** Equivalent to `exercise_files` but scoped to a submission.                                                  |
| Frontend image upload UI on take page                   | **Missing.** `StudentTakeExercisePage.jsx` only renders the manual form.                                                 |
| Camera capture                                          | **Missing.** Will use `<input type="file" accept="image/*" capture="environment">` (no extra deps).                      |
| Tesseract.js                                            | **Not installed.** No package, no code. Stays uninstalled.                                                               |

---

## Architecture

```diagram
╭─────────────╮  1. POST image  ╭──────────────╮  2. fetch schema   ╭────╮
│ Student     │────────────────▶│  Worker      │───────────────────▶│ D1 │
│ (Take page) │                 │  /extract    │                    ╰────╯
╰─────────────╯                 │              │
       ▲                        │              │  3. PUT image      ╭────╮
       │                        │              │───────────────────▶│ R2 │
       │ 6. populate form       │              │                    ╰────╯
       │    {extracted, conf}   │              │
       │                        │              │  4. vision call    ╭──────────╮
       │                        │              │───────────────────▶│ Grok via │
       │                        │              │                    │ OpenRouter│
       │                        │              │◀───────────────────╰──────────╯
       │                        │              │  5. JSON answers
       ╰────────────────────────╰──────────────╯
```

### Backend changes

#### 1. New table: `submission_files`

Mirrors `exercise_files`. Migration `0007_add_submission_files.sql`:

```sql
create table submission_files (
  id            integer primary key autoincrement
, submission_id integer not null references submissions(id) on delete cascade
, file_type     text    not null check (file_type in ('answer_sheet'))
, r2_key        text    not null
, filename      text    not null
, size_bytes    integer not null
, created_at    text    not null default current_timestamp
);

create index idx_submission_files_submission on submission_files(submission_id);
```

`file_type` is constrained to `'answer_sheet'` for now; future image upload kinds (e.g., scratch work) can extend the check constraint.

Cascade delete keeps R2 bookkeeping consistent with the existing pattern (see Cascade Deletes design decision).

Update [docs/schema.dbml](file:///Users/lelouvincx/Developer/smartclass/docs/schema.dbml) accordingly.

#### 2. New endpoint: `POST /api/submissions/:id/extract`

Single endpoint that does upload + extract + return. We deliberately do **not** split into two endpoints: the only reason to upload an answer-sheet image is to extract from it, and a 1-shot endpoint avoids a round trip and orphan uploads.

- Auth: `requireAuth`, must be the submission owner, submission must be in-progress (`submitted_at IS NULL`).
- Body: `multipart/form-data` with:
  - `image` — jpg/png, ≤ 20 MB
  - `model` (optional) — one of the allowed model ids (see "Model selection" below). Defaults to the server-side default if omitted or unknown.
- Behavior:
  1. Validate ownership + state.
  2. Validate `model` against an allowlist; fall back to default if invalid (so a stale UI doesn't block the user).
  3. Stream image to R2 at `submissions/{submission_id}/{timestamp}-{filename}`.
  4. Insert row into `submission_files`.
  5. Fetch `answer_schemas` for the exercise.
  6. Call `requestAnswersFromImage(env, { imageBytes, contentType, schema, model })` (new helper in `worker/lib/openrouter.js`).
  7. Validate the LLM response (q_ids/sub_ids must exist in the schema; types must match; values normalized).
  8. Return `{ file_id, model_used, extracted: [{q_id, sub_id?, answer, confidence}], warnings: [...] }`.
- Errors:
  - `413` if image > 20 MB
  - `415` if not jpg/png
  - `502` if OpenRouter + Gemini fallback both fail (see existing retry logic)
  - `422` if the LLM returned malformed JSON we cannot recover

##### Model selection

Both backend and frontend share an allowlist (initially small, easy to extend):

```js
// worker/lib/extract-models.js  (also imported by the frontend via a shared constants file)
export const EXTRACT_MODELS = [
  {
    id: "x-ai/grok-4.1-fast",
    label: "Grok 4.1 Fast (default)",
    provider: "openrouter",
  },
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "openrouter",
  },
  { id: "openai/gpt-4o-mini", label: "GPT-4o-mini", provider: "openrouter" },
];
export const DEFAULT_EXTRACT_MODEL = "x-ai/grok-4.1-fast";
```

`provider: 'openrouter'` means the backend routes the call through `openrouter.js` (which already handles auth and Gemini fallback). Adding a non-OpenRouter provider later (e.g., Anthropic direct) is a one-file change and does not affect the request contract.

#### 3. New helper: `requestAnswersFromImage(env, { imageBytes, contentType, schema, model })`

Lives next to `requestSchemaFromOpenRouter` in [worker/lib/openrouter.js](file:///Users/lelouvincx/Developer/smartclass/worker/lib/openrouter.js). Reuses the same fallback and retry logic. The `model` argument selects which OpenRouter model to call; the existing Gemini fallback still kicks in on retryable errors regardless of which model was requested. Only the prompt and the message format change vs. the teacher path (vision messages use the OpenAI-compatible `image_url` content type with a `data:` URI built from `imageBytes` + `contentType`).

Schema-aware prompt skeleton:

```
You are extracting a student's answers from a photo of an answer sheet.
The exercise has the following questions. For each, return the student's answer.

Schema (do not invent extra rows):
[
  { "q_id": 1, "type": "mcq" },
  { "q_id": 2, "type": "boolean", "sub_id": "a" },
  { "q_id": 2, "type": "boolean", "sub_id": "b" },
  ...
  { "q_id": 12, "type": "numeric" }
]

Output strict JSON only: {"answers":[...]}.
Each row:
  MCQ:     {"q_id":1, "answer":"B", "confidence":0.0-1.0}
  Boolean: {"q_id":2, "sub_id":"a", "answer":"1"|"0", "confidence":...}
  Numeric: {"q_id":3, "answer":"42", "confidence":...}

Rules:
- Only emit rows whose (q_id, sub_id) appears in the schema above.
- If a question is blank or unreadable, set "answer": null and confidence ≤ 0.3.
- mcq answer must be A/B/C/D; boolean must be "1"/"0"; numeric must parse as a number.
- Do not include explanations, markdown, or any text outside the JSON object.
```

Why pass the schema?

- Constrains output to the slots we actually care about (no hallucinated q_ids).
- Tells the model exactly which questions are boolean sub-rows, so it knows to look at 4 cells per question.
- Lets us validate responses by simple key-set comparison.

#### 4. Validator (`worker/lib/extract-validator.js`, new)

Pure function: takes the LLM JSON string and the schema, returns `{answers, warnings}`. Mirrors the validation in [worker/routes/exercises.js](file:///Users/lelouvincx/Developer/smartclass/worker/routes/exercises.js) for teacher schema extraction:

- Parse JSON; if it fails, throw a structured error.
- Drop any row whose `(q_id, sub_id)` is not in the schema (warn).
- Normalize per type (uppercase MCQ; trim numeric; coerce boolean to `'1'`/`'0'`).
- For schema rows that the model omitted, emit `{q_id, sub_id, answer: null, confidence: 0}` so the frontend gets a complete shape.
- Return warnings (e.g., "Q5 returned 'E' (not A/B/C/D), dropped"). Surfaced in the response so the UI can show them.

### Frontend changes

#### Take page UI ([src/pages/StudentTakeExercisePage.jsx](file:///Users/lelouvincx/Developer/smartclass/src/pages/StudentTakeExercisePage.jsx))

Add a new "Input mode" segmented control above the answer form:

```
( ● Manual )  ( ○ Upload photo )
```

##### Upload-mode panel (new component `src/components/answer-image-upload.jsx`)

Designed for a smooth, legible flow. Extraction can take 5–15 s and the UI must communicate status clearly without locking the form.

State machine:

```
idle ──pick file──▶ previewing ──submit──▶ uploading ──server ack──▶ extracting ──result──▶ done
                          │                     │                          │
                          ╰────cancel───────────┴──────────error───────────╯ ──▶ error (retry / replace)
```

Layout (desktop):

```
╭──────────────────────────────────────────────────────────────────────╮
│  [ Model: Grok 4.1 Fast (default) ▾ ]                  [Replace img] │
│  ┌──────────────────┐                                                │
│  │                  │   Status: Extracting answers...                │
│  │   image preview  │   ████████████░░░░░  60%                       │
│  │   (max 240px)    │                                                │
│  └──────────────────┘   "This usually takes 5–15 seconds."           │
│                                                                      │
│  ⚠ 2 warnings — Q5 unreadable, Q12 confidence low                    │
╰──────────────────────────────────────────────────────────────────────╯
```

Layout (mobile): same elements stacked vertically; preview shrinks to full-width thumbnail.

Behaviour details:

1. **Picker**: shadcn dropzone wrapper around `<input type="file" accept="image/*,.jpg,.jpeg,.png" capture="environment">`. Same element handles drag-and-drop on desktop and "Take photo / Pick from library" on mobile.
2. **Client-side validation before upload**: file type (jpg/png), size (≤ 20 MB). Surfaces inline errors instantly so we don't waste a network round trip.
3. **Preview**: render via `URL.createObjectURL` so it appears the moment the file is selected. Revoke on unmount / replace.
4. **Upload progress**: use `XMLHttpRequest` (not `fetch`) for the upload portion so we get an `onprogress` event and can show a real percentage during the upload phase. Once upload hits 100% we switch the label to "Extracting answers..." and show an indeterminate progress bar (we don't know how long Grok will take).
5. **Cancel**: the upload phase is cancellable (abort the XHR). The extract phase is not (server-side; would require streaming SSE which is out of scope) — the cancel button is replaced with "Working..." once we leave the upload phase.
6. **Result merge**: on success, merge `extracted` into the existing `answers` state. Highlight pre-filled cells with a soft background tint and a confidence dot:
   - green (≥ 0.8) — high confidence
   - amber (0.5–0.8) — review recommended
   - red (< 0.5) — likely wrong, please check
     The form auto-scrolls to the first low-confidence cell.
7. **Banner**: "Review the extracted answers and correct any mistakes before submitting." Plus any warnings from the validator (collapsible list).
8. **Replace image**: top-right action; goes back to the `previewing` state with the new image.
9. **Manual edits**: editing a highlighted cell clears the highlight + dot on that cell (signal: "I have personally verified this one").
10. **Errors**: any 4xx/5xx surfaces a friendly message with two buttons — "Retry" (re-POST) and "Switch to manual" (closes panel without losing manual answers).

Submission flow is unchanged — the student still hits **Submit**, the same `PUT /api/submissions/:id/submit` runs, and grading is identical.

##### Model picker

A small shadcn `<Select>` at the top-right of the upload panel, sourced from the shared `EXTRACT_MODELS` constants module. Selected value is sent as the `model` form field on the extract request and persisted to `localStorage['smartclass-extract-model']` so the choice sticks across sessions.

If the chosen model fails (e.g., 502), the error banner suggests "Try a different model" with a one-click switch to the default. The server-side allowlist check makes a stale local value harmless — the worker just falls back to the default and notes the substitution in `model_used`.

#### New API client function ([src/lib/api.js](file:///Users/lelouvincx/Developer/smartclass/src/lib/api.js))

```js
export function extractAnswersFromImage(
  token,
  submissionId,
  imageFile,
  model,
  { onProgress, signal } = {},
) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("image", imageFile);
    if (model) form.append("model", model);

    xhr.open("POST", `${baseUrl}/api/submissions/${submissionId}/extract`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      const body = JSON.parse(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) resolve(body.data);
      else reject(new Error(body?.error?.message || "Extraction failed"));
    };
    xhr.onerror = () => reject(new Error("Network error"));
    if (signal) signal.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}
```

We use XHR (not `fetch`) only for this endpoint — `fetch` does not surface upload progress. All other endpoints continue to use the existing `request()` helper.

---

## Decisions

| Decision                           | Choice                                                                          | Rationale                                                                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extraction engine                  | **Vision LLM (Grok via OpenRouter, default)** with user-selectable alternatives | See "Why not OCR?" table. Selectable model list keeps us from being locked to one provider and lets power users pick a model that works better in their region/cost profile.           |
| Tesseract.js                       | **Don't install**                                                               | Removes 2 MB of WASM from the bundle, kills a whole class of layout-parser bugs.                                                                                                       |
| Endpoint shape                     | **Single `POST /:id/extract`** (upload + extract atomically)                    | Avoids orphan R2 objects, fewer round trips, simpler client.                                                                                                                           |
| Storage                            | **Persist image in R2 + `submission_files` row, indefinitely**                  | Auditable; teachers can review the source image when investigating disputed grades. Cheap enough at R2 storage prices. Cleanup policy can be added later if storage becomes a concern. |
| Auto-submit                        | **No**                                                                          | Student always reviews. Matches v0.2 design rule "No auto-submit on timer expiry" — student agency over automation.                                                                    |
| Per-question confidence            | **Returned, displayed as a tri-color dot (green/amber/red)**                    | Cheap, helpful, and lets us tune a future "auto-confidence threshold" feature without schema changes.                                                                                  |
| Schema in prompt                   | **Yes (constrain output)**                                                      | Cuts hallucinated q_ids to ~zero in our teacher-side extraction; same gain expected here.                                                                                              |
| Image size limit                   | **20 MB**                                                                       | Modern phone cameras (12–48 MP) routinely produce 5–15 MB JPEGs; 20 MB cap prevents truncated uploads while still bounding abuse.                                                      |
| Camera vs. file picker             | **Both via `<input capture>`**                                                  | One element handles both on mobile (opens camera) and desktop (file picker). No extra deps.                                                                                            |
| Upload progress UX                 | **XHR with `upload.onprogress`**                                                | `fetch` cannot report upload progress. XHR is isolated to this one endpoint; no broader API refactor.                                                                                  |
| Model selection UI                 | **shadcn Select on the upload panel, persisted to `localStorage`**              | Lightweight, sticks across sessions, easy to extend. Server-side allowlist makes stale values safe.                                                                                    |
| Standardized answer-sheet template | **Defer**                                                                       | Grok handles freehand sheets adequately. Add a printable PDF template later if accuracy demands it.                                                                                    |

---

## Edge cases

| Situation                                   | Behavior                                                                                                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM omits some q_ids                        | Validator fills with `{answer: null, confidence: 0}` so UI is complete; user fills manually.                                                                                     |
| LLM returns extra q_ids                     | Dropped with a warning.                                                                                                                                                          |
| MCQ value not A/B/C/D                       | Dropped with a warning ("Q5: 'E' is not a valid MCQ answer").                                                                                                                    |
| Boolean sub-question missing one of a/b/c/d | Missing sub fills with null; user toggles manually.                                                                                                                              |
| Numeric value not parseable                 | Kept as-is (string). Grading already tolerates non-numeric strings as wrong.                                                                                                     |
| OpenRouter unavailable                      | Same fallback as teacher path: retry on Gemini if error message is retryable; else 502 with a friendly message. UI tells the student to retry, switch model, or use manual mode. |
| Unknown / stale `model` value from client   | Worker silently substitutes the default and returns `model_used` in the response so the UI can correct local state.                                                              |
| Upload after submit                         | 409 Conflict — submission is locked.                                                                                                                                             |
| Upload to someone else's submission         | 403.                                                                                                                                                                             |
| Submission timer expired                    | Allowed. Extraction does not bump `started_at`. Student is "over time" but can still submit.                                                                                     |

---

## Tests

### Backend

- `worker/lib/extract-validator.test.js` (unit) — JSON parsing, schema filtering, type normalization, missing-row backfill, warning generation.
- `worker/routes/submissions.integration.test.js` — extend with:
  - happy-path extract on a fixture image (mocked OpenRouter response)
  - 403 if non-owner extracts
  - 409 if submission already submitted
  - 413 oversize image (just over 20 MB)
  - 415 wrong content-type
  - 502 when both OpenRouter and Gemini fail (mocked)
  - `model` parameter forwarded to OpenRouter when valid; substituted with default and `model_used` reflects the substitution when invalid
- Mock OpenRouter via `vi.spyOn(globalThis, 'fetch')` — same pattern as existing OpenRouter tests in `worker/routes/exercises.integration.test.js`.

### Frontend

- `StudentTakeExercisePage.test.jsx` — extend with:
  - mode toggle renders
  - successful extraction merges into form state and highlights cells
  - low-confidence cells get the warning indicator
  - manual edit clears highlight on that cell
  - extraction error shows banner without breaking the form
- `answer-image-upload.test.jsx` (new) — covers the upload component in isolation:
  - file-type and 20 MB size validation reject before upload
  - upload progress callback fires
  - cancel during upload aborts the request
  - model picker reads/writes `localStorage`
  - retry after error re-issues the request with the same image

---

## Phasing (PRs)

Small, independently mergeable steps:

1. **PR A — DB + endpoint scaffold.** Migration `0007` for `submission_files`, schema.dbml update, `worker/lib/extract-models.js` shared constants, `POST /api/submissions/:id/extract` returning a stub (no LLM call yet) so the contract — including `model` validation and 20 MB cap — is testable.
2. **PR B — LLM helper + validator.** Add `requestAnswersFromImage` to `openrouter.js` (with `model` arg). Add `extract-validator.js` with unit tests. Wire into the endpoint, return `model_used`.
3. **PR C — Frontend upload component.** New `src/components/answer-image-upload.jsx` (dropzone, preview, XHR with progress, model picker, state machine). API client function. Integration into `StudentTakeExercisePage` with mode toggle.
4. **PR D — Result merge + UX polish.** Highlight + tri-color confidence dots, warnings banner, error/retry UI, auto-scroll to first low-confidence cell, README roadmap update, AGENTS.md design-decisions entry.

Once PR C lands, the mode toggle is live (with PR D adding the polish that makes it feel finished).

---

## Cost estimate

Assumptions:

- 1 image per submission, ~1500 input tokens (image) + ~800 output tokens (JSON for ~25 questions).
- Grok 4.1 Fast pricing (Apr 2026): ~$0.20/1M input, ~$0.50/1M output.

Per submission: `1500 × 0.20/1M + 800 × 0.50/1M ≈ $0.0007`.

Per 1000 submissions: **~$0.70**.

Plus R2 storage at ~$0.015/GB/month: 1000 images × 1 MB = 1 GB = **$0.015/month** for storage; egress is free on R2.

Comfortably within the "free experiment" budget.

---

## Future extensions (not in v0.4)

- **Standardized answer-sheet template** (printable PDF) — improves accuracy on dense 40+ question exams.
- **Camera framing UX** — edge detection + skew correction before upload (deferred to v0.6 polish).
- **Auto-confidence threshold** — auto-submit when all answers exceed e.g. 0.9 confidence (requires UX research; risky).
- **Multi-image upload** — for exams that span multiple sheets. Endpoint can accept an array; LLM call is the same.
- **Re-extract from teacher-uploaded source** — teacher view shows the original image alongside the extracted answers for dispute resolution. Data is already there (`submission_files`), just needs UI.
