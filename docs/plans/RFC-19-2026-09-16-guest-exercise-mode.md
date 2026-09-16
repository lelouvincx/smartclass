---
rfc: RFC-19
title: Guest exercise mode with local anonymous results
date: 2026-09-16
status: Proposed
dependencies: [RFC-17, RFC-18]
---

# Guest exercise mode with local anonymous results

This document plans guest exercise browsing, anonymous exercise attempts, and local result storage. The feature is not shipped. See [PRODUCT.md](../../PRODUCT.md) for current behaviour and [TODO.md](../../TODO.md) for planned work.

## Result

Anonymous visitors can try public exercises before registration.

Guests can:

- browse exercises that teachers publish for Guest access
- open the same question-first exercise experience that students use
- save draft answers and submitted results in the current browser
- review their local results after submission
- register or sign in without changing authenticated student history

Guests cannot:

- access Standard or VIP exercises
- download teacher-only Answer PDFs
- write anonymous attempts to D1
- synchronize results between browsers or devices
- convert local results into authenticated submissions in this release

Publishing an exercise for Guest access makes its pinned answer key and score allocation public through the Guest grading schema. Local grading cannot keep answers secret from a visitor who inspects network responses or IndexedDB. Pre-submission answer hiding is a user-interface rule, not a security boundary. Teachers must see this warning before they publish an exercise for Guest access.

## Product rule

Use the existing content entitlement rule with one addition: visitors may access ready exercises whose minimum tier is Guest through the explicit Guest audience API.

Guest exercise access ignores programme assignments. Programme assignments restrict authenticated student access only.

The API must not treat invalid credentials as Guest access. If a request includes an invalid or expired token, return the existing authentication error. If a request has no token, evaluate the request as anonymous Guest access.

Authenticated users keep the existing role and membership rules. A pending, disabled or blocked account does not fall back to Guest access.

Use this audience matrix for public exercise routes:

| Request state | Result |
| --- | --- |
| no credential | Guest audience |
| malformed or expired credential | `401`, with no anonymous retry |
| blocked identity | existing account-disabled error |
| missing, pending or disabled workspace membership | existing membership error |
| valid active student, teacher or administrator | Guest-filtered public response |

Public pages must forward an existing credential. Public pages must not retry anonymously after an authentication or account failure.

## Public routes

Add public exercise routes outside the authenticated student layout:

| Route | Purpose |
| --- | --- |
| `/exercises` | list ready Guest exercises in the current workspace |
| `/exercises/:id` | show the exercise landing page |
| `/exercises/:id/take` | take one local guest attempt |
| `/exercises/:id/results/:localAttemptId` | show a local summary |
| `/exercises/:id/results/:localAttemptId/review` | show local question-by-question review |

Keep `/student/exercises` for signed-in students. If a signed-in user visits a public exercise route, keep the user on the public route unless they choose an authenticated action. The public route still uses the audience matrix above.

The public layout should match Guest lectures: limited navigation, language switching, and sign-in or registration calls to action.

## API shape

Add explicit Guest-audience API routes. These routes use optional identity validation, not the authenticated student exercise contract:

| Endpoint | Anonymous response |
| --- | --- |
| `GET /api/public/exercises` | ready exercises where `minimum_access_tier = 'guest'` |
| `GET /api/public/exercises/:id` | Guest grading schema and active question assets for a ready Guest exercise |
| `GET /api/public/question-assets/:id` | question image if the asset belongs to the current active set of a ready Guest exercise |
| `GET /api/public/exercises/:id/exercise-pdf` | answer-free Exercise PDF pinned to the current confirmed active set |

Do not expose files through a submission-scoped URL for guests. Guests do not have server submissions. Use an exercise-scoped public PDF route for the answer-free Exercise PDF if no suitable route already exists.

Do not add anonymous create, submit or history endpoints in this release. The browser grades guest submissions locally from the Guest grading schema. The Guest grading schema contains the fields needed for grading, including `correct_answer` and `max_score_hundredths`.

Keep `jsonSuccess` and `jsonError` for JSON responses. Mark audience-dependent public reads as `private, no-store`, matching curriculum reads.

## IndexedDB storage

Use IndexedDB, not `localStorage` or `sessionStorage`, for guest attempts and results. Exercise attempts can include many answers and may outlive the tab.

Create one database:

```text
smartclass_guest_exercises_v1
```

Create these object stores:

| Store | Key | Purpose |
| --- | --- | --- |
| `attempts` | `localAttemptId` | one local attempt per started guest exercise attempt |
| `answers` | `[localAttemptId, answerKey]` | draft answers keyed by question and sub-question |
| `results` | `localAttemptId` | submitted score, graded answers and submitted time |
| `schemas` | `localAttemptId` | pinned Guest grading schema for the attempt |

Use a generated local attempt ID with a random component. Do not store phone numbers, names, tokens or registration form values in this database.

Store these attempt fields:

- `localAttemptId`
- `workspaceId`
- `exerciseId`
- `exerciseTitle`
- `questionAssetSetId`
- `startedAt`
- `submittedAt`, nullable
- `mode`
- `durationMinutes`

Use `questionAssetSetId` as the content version. At attempt start, store the complete Guest grading schema and the question-asset metadata needed for labels and local review. If a visitor resumes an attempt and the current exercise has a different `questionAssetSetId`, keep the old local attempt read-only and offer a new attempt. Do not silently regrade old answers against new content.

Do not store question image blobs in the first release. Old local results can still show the pinned schema, submitted answers, correct answers and grading. Old question images and Exercise PDFs may disappear if the exercise is unpublished, replaced or no longer Guest-accessible. State this limitation in the review page if an old image cannot load.

Guest attempts are unlimited and local. Authenticated `max_attempts` does not apply to Guest attempts because local storage can be cleared. Keep at most one resumable Guest draft per exercise in the current browser. A second attempt means starting a new local attempt after submitting or discarding that draft.

Timed Guest attempts use wall-clock time and continue across reloads and closed tabs. Expiry never auto-submits. Local timing is advisory because the device clock is not trusted.

## Local grading

Reuse the existing grading rules in browser-safe code. The browser must produce the same score as the Worker for the same schema and answers.

Move the pure grading logic to a shared module that both the Worker and frontend tests import. Do not call the Worker submission endpoints for guests.

On submit, write the result and mark the attempt submitted in one IndexedDB transaction. The browser stores these result fields:

- total score on the 0 to 10 scale
- per-answer submitted value
- per-answer correctness
- skipped, correct and incorrect counts
- submitted time

Derive score maxima and display labels from the pinned Guest grading schema. Do not duplicate derived schema data in the result object.

After submission, the review page may show correct answers because the result is local and the exercise has ended. The take page must not show correct answers before submission.

If IndexedDB is unavailable, blocked or over quota, keep answers in memory for the current page, show that answers are not saved, and offer retry. Do not claim persistence until the IndexedDB transaction commits. Local retention is best effort because browsers can evict IndexedDB data.

## Registration prompt

Prompt guests to register after engagement, not before first use.

This prompt remains the separate P1 TODO item. It is not required for the P0 Guest exercise browsing and local-result release.

Show the prompt after either condition:

- the guest submits one local attempt
- the guest starts a second local attempt in the same workspace

The prompt should explain that local results stay on this device. Registration does not upload past guest results in this release.

## Data retention and deletion

Keep local guest attempts until the visitor deletes them, clears browser storage, or the browser evicts IndexedDB data. Provide a visible action to clear guest exercise data from the public exercise area.

Signing in must not delete guest results automatically. If a signed-in user returns to the public route, guest results remain local and separate from authenticated student history.

## Security boundaries

The API must enforce these rules:

- only ready Guest exercises appear to anonymous visitors
- unready, Standard and VIP exercises return 404 on anonymous detail and file reads
- invalid credentials return authentication errors instead of anonymous data
- teacher-only files and answer-detail images never appear in anonymous responses
- guest result storage never writes to D1 or R2
- public question images are served only when their asset set is the current active set for a ready Guest exercise
- publishing an exercise for Guest access requires an explicit teacher action with an answer-publication warning

## Implementation plan

1. Add API tests for anonymous exercise list, detail, question image and Exercise PDF access.
2. Add route-guard tests for public exercise routes outside `ProtectedRoleRoute`.
3. Add IndexedDB helpers with migration tests, blocked-storage fallbacks and question-asset-set version checks.
4. Move grading into one shared module with fixtures that compare Worker and browser output.
5. Build the public exercise list, landing, take, summary and review pages. Reuse presentational question, image and result components only where the component boundaries allow it. Guest routes must own a separate IndexedDB-backed state flow and must not use student submission pages, `submission-draft` state or submission APIs.
6. Add the clear-local-data action.
7. Complete the [frontend acceptance contract](../../DESIGN.md#frontend-acceptance) on public list, take, submitted summary, review, empty, error, narrow mobile and blocked-storage states.

For the P1 registration prompt, add the prompt and its own acceptance tests after P0 Guest exercise mode is stable.

## Acceptance tests

Cover these cases before shipping:

- no token can list and open only ready Guest exercises
- invalid token cannot fall back to Guest access
- pending, disabled and blocked accounts keep their current membership errors
- Standard and VIP exercises are absent from anonymous list, detail and file routes
- an anonymous take page saves answers across refresh by IndexedDB
- local grading matches Worker grading for multiple choice, numeric and true or false answers
- changed active question set makes an old local attempt read-only
- old local review still shows pinned answers and grading when images are unavailable
- guest results stay separate from authenticated submissions after sign-in
- clearing guest data removes attempts, answers and results for the current browser
- blocked or unavailable IndexedDB shows an explicit not-saved state and preserves in-memory answers until navigation

P1 registration-prompt acceptance tests:

- the registration prompt appears only after the engagement threshold
- the prompt explains that local results stay on this device

## Decisions

- teachers publish Guest exercises through an explicit Guest setting with an answer-publication warning
- timed Guest attempts continue across closed tabs and never auto-submit
- the public Exercise PDF route is `GET /api/public/exercises/:id/exercise-pdf`
