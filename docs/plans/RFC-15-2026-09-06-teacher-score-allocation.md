---
rfc: RFC-15
title: Teacher-adjustable score allocation
date: 2026-09-06
status: Accepted
dependencies: [RFC-2, RFC-11, RFC-13]
---

# RFC: Teacher-adjustable score allocation

## Trigger

SmartClass assigns fixed grading weights by answer type. Teachers can correct a parsed question type and answer, but they cannot decide how much each question contributes to the final score.

This is restrictive for exercises whose source material already defines a score distribution. It also prevents teachers from making one topic more important than another.

## Decision

SmartClass will add a score allocation step to exercise creation. The step will appear after the answer table and before **Save exercise**.

Teachers will choose one of 2 allocation modes:

- **Automatic allocation** uses SmartClass's current type-based grading proportions
- **Custom allocation** lets the teacher assign each question a maximum score

The final exercise score remains 10.0. Custom allocations must total exactly 10.0 before the teacher can save or activate the exercise.

```diagram
Exercise details and PDFs
            │
            ▼
Parse and correct answers
            │
            ▼
Allocate 10.0 points
            │
            ▼
Save, prepare images, review and activate
```

RFC-15 supersedes RFC-2 only where RFC-2 fixes maximum points by answer type. RFC-2 remains authoritative for answer matching, skipped answers, numeric tolerance, boolean partial-credit ratios, synchronous grading, and the 0 to 10 result scale.

## Score model

### Automatic allocation

Automatic allocation preserves current grading results.

SmartClass starts with these relative weights:

| Answer type | Relative weight |
|---|---:|
| Multiple choice | 0.25 |
| Numeric | 0.50 |
| True or false | 1.00 |

SmartClass uses RFC-2's existing formula and rounds only the final normalized score. It does not round or store a point value for each question. A student who answers 1 of 3 equal multiple-choice questions correctly therefore receives 3.33, not 3.34.

The interface shows each question's relative weight and states that SmartClass normalizes the final score to 10. The teacher does not edit individual values while automatic allocation is selected.

### Custom allocation

When the teacher selects custom allocation, SmartClass creates an equal 10-point distribution. The teacher can then change one or more values or replace the equal distribution with the current type-based proportions.

Each value:

- applies to one global `q_id`, not one answer-schema row
- uses points on the 0 to 10 scale
- must be at least 0.01
- accepts no more than 2 decimal places

The values for all distinct questions must total exactly 10.0. SmartClass stores each value as integer hundredths of a point. For example, 0.25 is stored as `25` and 1.00 as `100`.

SmartClass converts automatic proportions to integer hundredths with the largest-remainder method:

1. Calculate each question's exact share of 1,000 hundredths from its relative weight.
2. Assign the whole-number part of each share.
3. Assign remaining hundredths by descending fractional remainder.
4. Break equal remainders by ascending global `q_id`.

This produces deterministic values that total 10.0.

Custom allocation is unavailable when an exercise has more than 1,000 questions because every question must be worth at least 0.01. **Use type proportions** is unavailable when rounding would give any question 0.00. The interface explains the constraint and keeps the valid equal distribution.

### True or false partial credit

A custom value on a true or false question is the maximum for all 4 parts. The existing partial-credit ratios scale that value:

| Correct parts | Share of the question value |
|---|---:|
| 0 of 4 | 0% |
| 1 of 4 | 10% |
| 2 of 4 | 25% |
| 3 of 4 | 50% |
| 4 of 4 | 100% |

For example, a true or false question worth 2.00 points awards 1.00 point for 3 correct parts.

SmartClass rounds only the final submission score to 2 decimal places. It does not round each question's earned value before summing.

## Creation experience

The score allocation card follows the answer table because allocation depends on the final question list and answer types.

The card contains:

- a heading, **Score allocation**
- short text stating that the exercise total is 10.0 points
- a radio group for **Automatic allocation** and **Custom allocation**
- one compact row per question, grouped by source section
- a persistent summary showing allocation status

Automatic rows show the question label, answer type, and relative weight. The summary reads **Automatic allocation · final score normalized to 10.0**. Custom rows replace the relative weight with a labelled decimal input.

The summary uses text as well as colour:

- **10.0 of 10.0 allocated** when the allocation is valid
- **0.50 points remaining** when the total is below 10.0
- **0.25 points over** when the total exceeds 10.0

The step also provides 2 secondary actions in custom mode:

- **Use type proportions** distributes 10.0 from the current automatic relative weights
- **Use equal points** distributes 10.0 equally across all questions

Changing a question type recalculates automatic allocation. Custom allocation keeps the question's existing value. Adding or deleting a question makes a custom allocation invalid until the teacher redistributes or edits the values.

Switching from custom to automatic allocation does not delete the custom values during the current page session. Switching back restores them. Saving in automatic mode stores no per-question values and preserves RFC-2 grading exactly.

## Validation and accessibility

SmartClass validates score inputs after the teacher leaves a field and again on submit. Input clears its existing error as soon as the teacher changes it.

If allocation is invalid on submit, SmartClass:

1. blocks the save or activation request
2. shows an error summary before the allocation rows
3. moves focus to the summary
4. links each error to its question input

Each input has a visible label or an accessible name that includes the section and local question number. Decimal inputs use a decimal keyboard hint on mobile. Status text is announced through a polite live region and never depends on colour alone.

The allocation rows use the existing bounded table pattern on desktop. On mobile, each question becomes a compact labelled row. The total summary and primary action remain reachable without horizontal page scrolling.

## Persistence

Add nullable `max_score_hundredths` columns to:

- `answer_schemas`
- `exercise_question_answer_schemas`

All rows for one true or false `q_id` store the same value. API validation rejects mixed values within one question.

An automatic schema stores `NULL` for every question. A custom schema stores one value for every distinct question, and those values total 1,000. The create and update APIs validate this rule independently of browser validation.

Existing rows keep `NULL`. A schema where every value is `NULL` uses RFC-2's current type-based calculation. This preserves existing exercises and active submissions without a data rewrite.

Creating a pending question asset set copies the current allocation with the answer-schema shape. Activation writes answers and score allocations in the same D1 batch. A started submission continues to use its pinned asset-set schema, including its score allocation.

The teacher can edit allocation values in the final activation proposal, as they can edit final answers. Activation validates the complete allocation, writes it to the pending snapshot and current schema, confirms the set, and changes the active pointer in one guarded D1 batch. The confirmed set is immutable.

Changing an active exercise's score allocation requires preparing and activating a replacement question asset set. Existing in-progress and submitted attempts keep the allocation they pinned when they started.

Legacy submissions with a `NULL` `question_asset_set_id` read the mutable current schema. SmartClass therefore rejects allocation-changing updates or activation for an exercise that has any such submission. Supporting those exercises requires a separate migration that gives each legacy submission an immutable schema snapshot.

## API behavior

Exercise schema items accept `max_score_hundredths`.

The API applies these rules:

- an automatic schema omits the field or sets it to `NULL` on every row
- a custom schema contains the field on every row
- all rows for one `q_id` contain the same integer
- each distinct question has a value from 1 to 1,000
- distinct-question values total 1,000
- mixed `NULL` and non-`NULL` values are invalid
- an existing legacy schema may omit the field or return `NULL`
- activation preserves the pending set's question identity and type while accepting validated final answers and allocation values

Teacher exercise responses include `max_score_hundredths`. Every explicit schema projection and payload builder must preserve the field. This includes creation, teacher reads, updates, pending-set copying, activation, and both grading queries.

`schemasMatch()` includes score allocation. A direct edit cannot treat different allocations as the same schema or bypass replacement activation.

## Grading behavior

`gradeSubmission()` uses the pinned `max_score_hundredths` value when present. Correct multiple-choice and numeric answers earn the complete question value. True or false answers earn the configured partial-credit share. Skipped true or false parts count as incorrect.

When all allocation values are `NULL`, `gradeSubmission()` follows RFC-2 without change. Mixed `NULL` and non-`NULL` values are invalid stored state and cause grading to fail without marking the submission as submitted.

For custom true or false questions, grading multiplies integer `max_score_hundredths` by the partial-credit percentage before summing. SmartClass rounds only the final score to 2 decimal places.

The submission write remains atomic. SmartClass writes answer correctness, final score, and `submitted_at` in one D1 batch after grading succeeds.

## Boundaries

This plan includes:

- allocation during exercise creation
- allocation review before activation
- replacement allocation for an active exercise
- pinned grading behavior for started submissions

This plan does not include:

- scores above or below 10
- negative values or zero-point questions
- different partial-credit curves per exercise
- free-form grading rubrics
- AI-generated score importance
- changing the score of a submitted attempt
- per-question score breakdowns in student or teacher review
- allocation changes for submissions without a pinned question asset set

## Delivery plan

Implement this behavior test-first in these stages:

1. Add failing grading tests for custom multiple-choice, numeric, true or false, mixed, legacy, and invalid allocations.
2. Add the D1 migration and update `docs/schema.dbml` in the same change.
3. Add API validation, pending-set copying, activation, and submission pinning tests.
4. Add the score allocation card to exercise creation and replacement preparation.
5. Add English and Vietnamese interface text.
6. Run the complete frontend acceptance checklist for exercise creation and replacement preparation.

## Acceptance criteria

- automatic allocation stores `NULL` and produces exactly the same scores as RFC-2
- 1 correct answer in a 3-question automatic multiple-choice exercise remains 3.33
- a teacher can switch to custom allocation and edit question values
- equal distribution always totals 10.0 deterministically for up to 1,000 questions
- type-proportion distribution totals 10.0 when every resulting question value is at least 0.01
- save and activation reject missing, invalid, mixed, or non-10.0 allocations
- true or false partial credit scales the configured question value
- changing allocation on an active exercise requires replacement activation
- allocation-changing updates reject exercises with unpinned legacy submissions
- active and submitted attempts keep their pinned allocation
- legacy exercises produce the same scores as before
- creation and replacement preparation remain usable at every viewport and theme required by `DESIGN.md`
