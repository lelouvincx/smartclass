# Grading Logic Design

**Date:** 2026-03-16  
**Status:** Implemented (v0.2)  
**PR:** #31  
**Implementation:** `worker/lib/grading.js`

---

## Overview

Auto-grading runs immediately after a student submits answers (`PUT /api/submissions/:id/submit`).
It compares each submitted answer against the answer schema, sets `is_correct` on every
`submission_answers` row, and computes a total `score` on the `submissions` row.

---

## Data model

| Table | Column | Type | Populated by |
|---|---|---|---|
| `submissions` | `score` | `REAL` | Grading (0–10 scale) |
| `submission_answers` | `is_correct` | `INTEGER` | Grading (0 or 1) |

Both columns existed before grading was implemented and were always `NULL`. They are now written
atomically in a `DB.batch()` call at the end of the submit endpoint.

---

## Answer types and matching rules

### MCQ (multiple choice)

- **Comparison:** exact string equality — `submitted_answer === correct_answer`
- **Both values are normalized to uppercase A/B/C/D** at write time by the frontend and backend validator
- **Skipped (null):** always wrong (`is_correct = 0`)
- **Points:** `0.25` if correct, `0` if wrong or skipped

```
submitted='B', correct='B'  →  is_correct=1, points=0.25
submitted='A', correct='B'  →  is_correct=0, points=0
submitted=null, correct='B' →  is_correct=0, points=0
```

### Numeric

- **Comparison:** numeric equality within tolerance `|Number(submitted) - Number(correct)| < 0.01`
- **Rationale:** Handles trailing zeros (`42.0` vs `42`) and common rounding differences from
  calculations. The 0.01 tolerance is intentionally narrow — it covers display rounding but NOT
  different significant figures (e.g., `3.14` vs `3.15` are both accepted as equal, but `3.14`
  vs `3.20` are not).
- **Skipped (null):** always wrong
- **Points:** `0.5` if within tolerance, `0` otherwise

```
submitted='42',   correct='42'   →  is_correct=1, points=0.5
submitted='42.0', correct='42'   →  is_correct=1   (trailing zero)
submitted='3.14', correct='3.14' →  is_correct=1
submitted='99',   correct='42'   →  is_correct=0, points=0
submitted=null,   correct='42'   →  is_correct=0, points=0
```

> **To change the tolerance:** Edit `NUMERIC_TOLERANCE` constant in `worker/lib/grading.js`.

### Boolean (Đúng/Sai)

Boolean questions have 4 sub-questions (a, b, c, d), each with an independent correct answer
(`'0'` = false, `'1'` = true). Sub-answers are graded individually (`is_correct = 0` or `1`),
then the sub-correct count determines partial credit for the whole question.

**Non-linear partial credit table:**

| Correct sub-questions | Question points |
|---|---|
| 0 | 0 |
| 1 | 0.1 |
| 2 | 0.25 |
| 3 | 0.5 |
| 4 | 1.0 |

**Rationale for non-linear curve:** A student guessing all 4 randomly gets an expected value of
2 correct (50%) → 0.25 points — barely above 0. This discourages blind guessing while still
rewarding partial understanding. The curve is steep at the top (3→0.5, 4→1.0) to reward students
who know the topic well.

> **To adjust the curve:** Edit `BOOLEAN_SCORE_TABLE` in `worker/lib/grading.js`.

```
4/4 correct → 1.0 points
3/4 correct → 0.5 points
2/4 correct → 0.25 points
1/4 correct → 0.1 points
0/4 correct → 0 points
```

---

## Score formula

```
max_possible_points = sum over each distinct q_id of:
  MCQ     → 0.25
  Numeric → 0.5
  Boolean → 1.0

score = round((earned_points / max_possible_points) * 10, 2)
```

- **Scale:** 0–10 (stored as `REAL` in SQLite)
- **`max_possible_points`:** sum of the maximum achievable points per distinct question, based on
  type — NOT a simple question count. A boolean question contributes `1.0`, MCQ `0.25`, numeric `0.5`.
- **Rounding:** 2 decimal places (`Math.round(...*100)/100`)
- **Full score:** 10.0 (all questions correct)
- **Zero score:** 0.0 (all wrong or all skipped)

### Example: mixed exercise (3 questions)

| Q# | Type | Result | Earned | Max |
|---|---|---|---|---|
| 1 | MCQ | Correct | 0.25 | 0.25 |
| 2 | Boolean | 3/4 correct | 0.5 | 1.0 |
| 3 | Numeric | Wrong | 0.0 | 0.5 |

```
max_possible = 0.25 + 1.0 + 0.5 = 1.75
score = (0.25 + 0.5 + 0.0) / 1.75 * 10 = 4.29
```

### Example: standard exercise (12 MCQ + 6 numeric + 4 boolean)

| Type | Count | Max pts each | Total max |
|---|---|---|---|
| MCQ | 12 | 0.25 | 3.0 |
| Numeric | 6 | 0.5 | 3.0 |
| Boolean | 4 | 1.0 | 4.0 |
| **Total** | | | **10.0** |

```
score = earned_points / 10.0 * 10 = earned_points   (max 10.0)
```

---

## Architecture: where grading runs

Grading is synchronous and runs inline in `PUT /api/submissions/:id/submit` after the answer
rows are inserted:

```
1. Validate answers (q_id range, duplicate check)
2. DB.batch([...insertAnswers, markSubmittedAt])   ← atomic insert
3. Fetch answer_schemas for this exercise
4. gradeSubmission(schema, insertedAnswers)         ← pure function, no DB
5. DB.batch([...updateIsCorrect, updateScore])      ← atomic grade write
6. Return updated submission + graded answers
```

**Why synchronous, not async/queue?**
- Exercise schemas are small (typically 20–60 questions; max a few hundred rows)
- D1 reads are fast for single-exercise fetches
- Students see their score immediately on submit — no polling needed
- Cloudflare Workers have a 30s CPU time limit; a 100-question exam grades in < 10ms

> If exercises grow to thousands of questions or grading becomes more complex (e.g., AI-assisted
> partial credit), move grading to a Cloudflare Queue or Durable Object.

---

## Edge cases

| Situation | Behavior |
|---|---|
| Skipped answer (null) | `is_correct = 0` always |
| Answer for unknown q_id | Rejected at validation (400) before grading runs |
| Schema has no rows | `score = 0`, no answers graded |
| Boolean with partial sub-answers | Remaining sub-answers treated as `null` → wrong |
| Numeric not a valid number | `is_correct = 0` (NaN check in `gradeNumeric`) |

---

## Future adjustments

All grading parameters are isolated in `worker/lib/grading.js` as named constants:

| Constant | Current value | Purpose |
|---|---|---|
| `MCQ_POINTS` | `0.25` | Points per correct MCQ answer |
| `NUMERIC_POINTS` | `0.5` | Points per correct numeric answer |
| `BOOLEAN_SCORE_TABLE` | `{0:0, 1:0.1, 2:0.25, 3:0.5, 4:1.0}` | Per-question partial credit curve for boolean |
| `NUMERIC_TOLERANCE` | `0.01` | Max allowed difference for numeric equality |

To change grading behaviour, edit these constants and run `npx vitest run worker/lib/grading.test.js`
to verify the tests still pass (update test expectations as needed).

---

## Tests

- **Unit tests:** `worker/lib/grading.test.js` — 19 tests covering all question types, partial
  credit table, mixed exercises, score formula, edge cases
- **Integration tests:** `worker/routes/submissions.integration.test.js` (Grading section) —
  6 tests verifying `is_correct` and `score` persist in the DB and are returned correctly
