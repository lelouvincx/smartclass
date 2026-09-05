---
rfc: RFC-14
title: Exercise attempt limits and identity
date: 2026-09-05
status: Accepted
dependencies: [RFC-2, RFC-4, RFC-6, RFC-11]
---

# RFC: Exercise attempt limits and identity

## Trigger

Teachers need 2 common exercise behaviors. A practice exercise can accept unlimited attempts. A mock exam can accept one attempt. When an exercise accepts repeated attempts, students need a separate score and review for Attempt 1, Attempt 2, and later attempts.

SmartClass currently stores each started attempt as a separate `submissions` row. However, the attempt identity is implicit. The student interface also treats a submitted exercise as complete and offers no retry action. The API can create more rows because it does not enforce an exercise limit.

## Decision

SmartClass will define the `submissions` grain as one user, one exercise, and one attempt.

Each submission will have an immutable, positive `attempt_number`. Attempt numbers start at 1 and increase within one `(user_id, exercise_id)` pair. A unique constraint will enforce this identity.

Each exercise will have a nullable `max_attempts` value:

- `NULL` means unlimited attempts
- a positive integer limits how many attempts each student can start
- zero and negative values are invalid

This model supports unlimited practice, one-attempt mock exams, and later limits such as 2 or 3 without adding exercise categories.

Timed or untimed mode remains independent from the attempt limit. A timed exercise can allow unlimited attempts. An untimed exercise can allow one attempt.

This RFC supersedes RFC-6 only where RFC-6 states that SmartClass does not allow retakes. RFC-6 remains authoritative for starting, resuming, submitting, grading, summary, and review behavior. RFC-11 remains authoritative for the question and answer-schema version pinned to each submission.

## Attempt lifecycle

Selecting Start creates a submission and allocates its attempt number. The attempt consumes one place in the exercise limit at that point. This matches the current lifecycle, where the server starts the timer and pins the question set before the take page opens.

Attempts are append-only. SmartClass never deletes or renumbers an individual attempt.

An attempt is in progress while `submitted_at IS NULL`. The current resumable attempt is the unsubmitted row with the greatest `attempt_number`. SmartClass offers Resume before it offers another attempt.

Selecting Start over creates a new independent attempt and consumes another place. It does not erase or change the previous attempt on the server. After the new attempt is submitted, the next-highest unsubmitted attempt becomes current. If no place remains, SmartClass keeps the current attempt and explains that the student has reached the limit.

Submitting an attempt records its score on the same submission row. A later attempt never replaces an earlier score, answers, pinned question set, or review.

Attempt numbers describe start order, not completion order. A later attempt can therefore finish before an earlier attempt. Student history labels the rows with their stored attempt numbers.

## Data model

Add `max_attempts` to `exercises`:

```sql
max_attempts INTEGER DEFAULT 1
  CHECK (max_attempts IS NULL OR max_attempts > 0)
```

Add `attempt_number` to `submissions`:

```sql
attempt_number INTEGER NOT NULL
  CHECK (attempt_number > 0)
```

Enforce one submission for each registered student attempt:

```sql
UNIQUE (user_id, exercise_id, attempt_number)
```

The uniqueness rule applies to authenticated submissions. A future server-side guest model must define guest identity before it can use the same rule. Planned guest attempts remain in IndexedDB and do not affect this migration.

Backfill existing submissions with `ROW_NUMBER()` partitioned by `(user_id, exercise_id)`. Order each partition by `COALESCE(started_at, created_at)`, then `created_at`, then `id`. The final `id` tie-break makes the result deterministic when existing timestamps match or `started_at` is null.

Backfill existing exercises with `max_attempts = 1`. This preserves the current student-facing behavior. Existing extra submission rows remain valid historical attempts, even when their number is above the new limit. The limit blocks new attempts and does not delete history.

Changing `max_attempts` never deletes or renumbers submissions. If a teacher lowers a limit below an existing attempt number, all existing attempts remain available and the API blocks new ones. Setting the value to `NULL` allows the next numbered attempt.

D1 orders a limit update and an attempt allocation. If allocation runs first, its row remains after a later decrease. If the decrease runs first, allocation uses the lower limit.

Migration must preserve each existing `question_asset_set_id`, including a legacy null value. Before implementation, audit authenticated submissions where `question_asset_set_id IS NULL`. Apply RFC-11's best-known legacy backfill where the source set can be established. Do not invent a pinned set when the historical source is uncertain.

Update `docs/schema.dbml` in the migration change.

## Atomic allocation

Every allocation request includes `known_latest_attempt_number`. The student gets this value from the server's exercise response. A first attempt uses zero.

For a request that observed latest attempt L, one `INSERT ... SELECT` may create only attempt L+1. The statement confirms that the current maximum is still L, access and readiness remain valid, and L+1 does not exceed `max_attempts`. A normal Start cannot create a row while a resumable attempt exists.

Start over also sends `replace_submission_id`. This ID must identify the current resumable attempt from the same student and exercise. An ordinary Start request omits this field. The explicit field separates an intentional Start over from a network retry.

If attempt L+1 already exists after a conditional insert does not create a row, the request is a replay and returns that same submission. Concurrent requests made from the same observed state therefore return one submission ID. The Worker does not allocate L+2 automatically.

If the current state has advanced beyond L+1 and no matching replay or current resumable attempt exists, the Worker returns `409 ATTEMPT_STATE_CHANGED`. The client reloads exercise state before offering another action. If the limit is exhausted, the Worker returns `409 ATTEMPT_LIMIT_REACHED`. It must not expose a generic database error.

The unique constraint is a database backstop. It is not the concurrency mechanism. D1 serializes writes, so a naive read of `MAX(attempt_number)` would let 2 identical requests allocate consecutive attempts without violating uniqueness.

The API remains the authority. Hiding a retry control in the interface is not an attempt-limit check.

## API behavior

Exercise create and update operations accept `max_attempts` as either `null` or a positive integer. Create requires the field in the new API. Update omission means unchanged. An explicit null value means unlimited. The operations reject booleans, fractions, zero, negative values, and strings.

Student exercise list and detail responses provide server-derived attempt state:

- `max_attempts`
- `latest_attempt_number`, or zero when no attempt exists
- `next_attempt_number`, which is `latest_attempt_number + 1`
- `in_progress_submission_id` and `in_progress_attempt_number` for the greatest unsubmitted attempt number
- `attempts_remaining`, or null for unlimited attempts
- `can_start_attempt`, after applying the limit, readiness, and grade-access rules

Teacher responses include `max_attempts`. The submitted-only, paginated history endpoint is not the source for current attempt state.

Submission creation accepts `known_latest_attempt_number` and an optional `replace_submission_id`. The known number must be a non-negative integer. A replacement ID must be a positive integer. Responses include `attempt_number`. The operation returns:

- the new submission when allocation succeeds
- the current resumable submission when an ordinary Start finds one
- the existing L+1 submission when a request replays after a lost response
- `409 ATTEMPT_LIMIT_REACHED` when the student has no available attempt
- `409 ATTEMPT_STATE_CHANGED` when stale observed state cannot be resolved safely

Submission list and detail responses include `attempt_number`. Submission history remains ordered by `submitted_at` descending. The stored attempt number supplies identity and does not depend on pagination or query order.

## Teacher interface

Exercise creation and editing will include an Attempt limit field separate from timed mode.

The field offers Unlimited and Limited choices. Limited requires a positive whole number and defaults to 1. Existing exercises show their stored value. Teacher exercise metadata shows either Unlimited attempts or the exact limit.

Saving a lower limit warns the teacher when some students already have attempts above that number. The save preserves those attempts and blocks new ones.

## Student interface

Exercise cards and landing pages use this action order:

1. Resume an in-progress attempt.
2. Start the next attempt when the limit allows it.
3. View the latest result when the limit is exhausted.

After a practice submission, the landing page shows the latest result and a Try again action. It states the next attempt number before the student starts.

After a limited exercise reaches its limit, the landing page shows the latest result and states that no attempts remain. It does not show Try again.

Submission history, summary, and review pages show Attempt N. History keeps every submitted attempt and score as a separate row. English and Vietnamese copy use the same attempt semantics.

The interface uses server-derived attempt state. A session-storage pointer can help resume the submission identified by the server, but it cannot override a newer server attempt or decide whether another attempt is allowed.

## Implementation sequence

The deployment workflow applies migrations before it deploys the matching Worker. Use an expand, deploy, and contract sequence so the old Worker can still create submissions during deployment.

1. Add failing migration and Worker tests for attempt identity, backfill, validation, idempotent allocation, limit exhaustion, and concurrent requests.
2. In the feature release, add an expand migration. Add `max_attempts` with `DEFAULT 1`. Add nullable positive `attempt_number`, backfill it, and add the unique index. Add a temporary insert trigger that assigns an attempt number when the old Worker omits it. Update `docs/schema.dbml` to describe this intermediate schema.
3. In the same feature release, deploy the compatible Worker after the expand migration. Extend exercise contracts with `max_attempts` and server-derived attempt state. Make submission creation always supply `attempt_number`, enforce limits, and implement observed-state replay behavior. Return attempt identity from submission list and detail routes.
4. Add the teacher Attempt limit control and metadata. Update student state selection, dashboard, exercise list, landing page, history, summary, and review. Add English and Vietnamese copy.
5. Update `PRODUCT.md`, remove the completed task from `TODO.md`, and add an Unreleased entry to `CHANGELOG.md` in the feature pull request.
6. In a later contract release, rebuild `submissions` with `attempt_number NOT NULL`. Preserve every column, foreign key, index, and child `submission_answers` row. Add an immutability trigger for `attempt_number`. Remove the compatibility trigger. Update `docs/schema.dbml` to describe the final schema.

## Verification

Worker tests must cover:

- deterministic backfill for several users and exercises
- backfill ordering when `started_at` is null
- unlimited, one-attempt, and finite multi-attempt exercises
- attempt numbers allocated in start order
- concurrent ordinary Start requests create one row and return the same submission ID
- concurrent Start over requests create one row and return the same submission ID
- a lost-response replay returns the original submission ID without consuming another attempt
- stale observed state returns `ATTEMPT_STATE_CHANGED` without allocating another attempt
- attempt 2 can finish before attempt 1, after which attempt 1 becomes the current resumable attempt
- the expand migration accepts inserts from the old Worker during deployment
- the contract migration preserves submissions, answers, foreign keys, indexes, and nullable legacy asset-set pointers
- lowering, raising, and removing an exercise limit
- preserved access to every historical score and existing question-set pointer
- server-side rejection after limit exhaustion

Frontend tests must cover:

- teacher creation and editing for Unlimited and Limited values
- validation for invalid limited values
- Resume taking priority over a new attempt
- server-derived current attempt state overriding a stale session-storage pointer
- Try again while capacity remains
- latest-result behavior when capacity is exhausted
- Attempt N labels in history, summary, and review
- English and Vietnamese parity

Run the complete frontend, Worker, integration, and build checks. Complete the frontend acceptance checklist in `DESIGN.md`. Inspect representative desktop and mobile states in light and dark themes.

## Acceptance criteria

- every authenticated submission has one stable positive attempt number
- `(user_id, exercise_id, attempt_number)` identifies one submission
- `max_attempts = NULL` allows unlimited attempts
- a positive `max_attempts` blocks allocation above that number
- concurrent and retried requests from one observed state return one submission and consume one attempt
- stale requests never allocate an unobserved later attempt
- changing a limit never deletes or renumbers history
- each submitted attempt keeps its own score, answers, timestamps, and existing question-set pointer
- students can resume an in-progress attempt
- the current resumable attempt is the unsubmitted row with the greatest attempt number
- students can start another attempt only when capacity remains
- teachers and students can distinguish the attempt limit from timed mode
- every student result surface identifies the attempt it represents
