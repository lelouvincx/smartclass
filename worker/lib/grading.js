/**
 * Auto-grading logic for SmartClass submissions.
 *
 * See docs/plans/2026-03-16-grading-logic.md for the full design document
 * and rationale for every decision made here.
 *
 * Quick reference:
 *   MCQ     — exact string match (both normalized to uppercase A/B/C/D); 0.25 pts if correct
 *   Numeric — numeric equality within NUMERIC_TOLERANCE (handles 42 vs 42.0); 0.5 pts if correct
 *   Boolean — per-sub-question comparison; non-linear partial credit per q_id; max 1.0 pt
 *   Score   — (earned_points / max_possible_points) * 10, 0–10 scale
 */

// ── Scoring tables & constants ─────────────────────────────────────────────────

/**
 * Points awarded for a correct MCQ answer (out of max_possible per question).
 */
const MCQ_POINTS = 0.25

/**
 * Points awarded for a correct numeric answer (out of max_possible per question).
 */
const NUMERIC_POINTS = 0.5

/**
 * Non-linear partial credit table for boolean (Đúng/Sai) questions.
 * Key = number of correct sub-questions out of 4.
 * Value = points awarded for that question (out of 1.0).
 *
 * Rationale: guessing all 4 randomly gives expected 2 correct → 0.25 pts,
 * making blind guessing worth very little. See grading design doc for details.
 */
const BOOLEAN_SCORE_TABLE = {
  0: 0,
  1: 0.1,
  2: 0.25,
  3: 0.5,
  4: 1.0,
}

/**
 * Maximum absolute difference accepted between submitted and correct numeric
 * values before they are considered unequal.
 * Handles trailing zeros (42.0 vs 42) and common rounding differences.
 */
const NUMERIC_TOLERANCE = 0.01

// ── Answer-matching helpers ────────────────────────────────────────────────────

/**
 * Returns 1 if the MCQ submitted answer matches the correct answer, 0 otherwise.
 * Both values are expected to already be uppercase (A/B/C/D) from normalization.
 * A null submitted answer (skipped) is always wrong.
 */
function gradeMcq(submitted, correct) {
  if (submitted === null || submitted === undefined) return 0
  return submitted === correct ? 1 : 0
}

/**
 * Returns 1 if the numeric submitted answer equals the correct answer within
 * NUMERIC_TOLERANCE, 0 otherwise.
 * A null submitted answer (skipped) is always wrong.
 */
function gradeNumeric(submitted, correct) {
  if (submitted === null || submitted === undefined) return 0
  const submittedNum = Number(submitted)
  const correctNum = Number(correct)
  if (Number.isNaN(submittedNum) || Number.isNaN(correctNum)) return 0
  return Math.abs(submittedNum - correctNum) < NUMERIC_TOLERANCE ? 1 : 0
}

/**
 * Returns 1 if the boolean sub-answer matches the correct value ('0' or '1'),
 * 0 otherwise. A null submitted answer (skipped) is always wrong.
 */
function gradeBooleanSub(submitted, correct) {
  if (submitted === null || submitted === undefined) return 0
  return submitted === correct ? 1 : 0
}

// ── Main grading function ──────────────────────────────────────────────────────

/**
 * Grade a submission by comparing submitted answers against the answer schema.
 *
 * @param {Array<{q_id: number, sub_id: string|null, type: string, correct_answer: string}>} schema
 *   The answer key rows from the `answer_schemas` table for this exercise.
 *
 * @param {Array<{q_id: number, sub_id: string|null, submitted_answer: string|null}>} answers
 *   The submitted answer rows from the `submission_answers` table.
 *
 * @returns {{ gradedAnswers: Array<{q_id, sub_id, is_correct}>, score: number }}
 *   - gradedAnswers: one entry per submitted answer row, with is_correct (0 or 1)
 *   - score: overall score on a 0–10 scale, rounded to 2 decimal places
 *
 * Algorithm:
 *   1. Build a lookup map from the schema: key = "q_id:sub_id" → {type, correct_answer}
 *   2. For each submitted answer, look up the schema entry and compute is_correct
 *   3. For boolean questions, collect per-sub is_correct values and apply
 *      BOOLEAN_SCORE_TABLE to get the question-level point value
 *   4. For MCQ, earned points = MCQ_POINTS (0.25) if correct, 0 otherwise
 *   5. For numeric, earned points = NUMERIC_POINTS (0.5) if correct, 0 otherwise
 *   6. score = (sum of earned points / max_possible_points) * 10
 *      where max_possible_points = sum of max pts per distinct q_id by type
 */
export function gradeSubmission(schema, answers) {
  // Step 1: Build schema lookup keyed by "q_id:sub_id" (sub_id='' for non-boolean)
  const schemaLookup = new Map()
  const distinctQids = new Set()

  for (const row of schema) {
    const key = `${row.q_id}:${row.sub_id ?? ''}`
    schemaLookup.set(key, { type: row.type, correct_answer: row.correct_answer })
    distinctQids.add(row.q_id)
  }

  if (distinctQids.size === 0) {
    return { gradedAnswers: [], score: 0 }
  }

  // Step 2: Grade each submitted answer row
  const gradedAnswers = answers.map((answer) => {
    const key = `${answer.q_id}:${answer.sub_id ?? ''}`
    const schemaRow = schemaLookup.get(key)

    if (!schemaRow) {
      // No matching schema row — treat as wrong
      return { q_id: answer.q_id, sub_id: answer.sub_id ?? null, is_correct: 0 }
    }

    let is_correct
    if (schemaRow.type === 'mcq') {
      is_correct = gradeMcq(answer.submitted_answer, schemaRow.correct_answer)
    } else if (schemaRow.type === 'numeric') {
      is_correct = gradeNumeric(answer.submitted_answer, schemaRow.correct_answer)
    } else {
      // boolean sub-answer
      is_correct = gradeBooleanSub(answer.submitted_answer, schemaRow.correct_answer)
    }

    return { q_id: answer.q_id, sub_id: answer.sub_id ?? null, is_correct }
  })

  // Step 3: Compute per-question earned points and max possible points
  // Group graded answers by q_id to handle boolean partial credit
  let earnedPoints = 0
  let maxPossiblePoints = 0

  for (const qid of distinctQids) {
    const schemaRows = schema.filter((r) => r.q_id === qid)
    const type = schemaRows[0]?.type

    if (type === 'boolean') {
      maxPossiblePoints += 1.0
      const subAnswers = gradedAnswers.filter((a) => a.q_id === qid)
      const correctCount = subAnswers.filter((a) => a.is_correct === 1).length
      earnedPoints += BOOLEAN_SCORE_TABLE[correctCount] ?? 0
    } else if (type === 'numeric') {
      maxPossiblePoints += NUMERIC_POINTS
      const ans = gradedAnswers.find((a) => a.q_id === qid)
      earnedPoints += ans?.is_correct === 1 ? NUMERIC_POINTS : 0
    } else {
      // mcq
      maxPossiblePoints += MCQ_POINTS
      const ans = gradedAnswers.find((a) => a.q_id === qid)
      earnedPoints += ans?.is_correct === 1 ? MCQ_POINTS : 0
    }
  }

  // Step 4: Compute final score on 0–10 scale
  const score = Math.round((earnedPoints / maxPossiblePoints) * 10 * 100) / 100

  return { gradedAnswers, score }
}
