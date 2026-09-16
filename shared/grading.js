/**
 * Auto-grading logic for SmartClass submissions.
 *
 * This module is browser-safe. The Worker and the guest exercise UI both use
 * it so authenticated and local guest grading stay identical.
 */

const MCQ_POINTS = 0.25
const NUMERIC_POINTS = 0.5
const BOOLEAN_SCORE_TABLE = {
  0: 0,
  1: 0.1,
  2: 0.25,
  3: 0.5,
  4: 1.0,
}
const NUMERIC_TOLERANCE = 0.01

function gradeMcq(submitted, correct) {
  if (submitted === null || submitted === undefined) return 0
  return submitted === correct ? 1 : 0
}

function gradeNumeric(submitted, correct) {
  if (submitted === null || submitted === undefined) return 0
  const submittedNum = Number(submitted)
  const correctNum = Number(correct)
  if (Number.isNaN(submittedNum) || Number.isNaN(correctNum)) return 0
  return Math.abs(submittedNum - correctNum) < NUMERIC_TOLERANCE ? 1 : 0
}

function gradeBooleanSub(submitted, correct) {
  if (submitted === null || submitted === undefined) return 0
  return submitted === correct ? 1 : 0
}

export function gradeSubmission(schema, answers) {
  const allocationValues = schema.map(row => row.max_score_hundredths ?? null)
  const hasCustomAllocation = allocationValues.some(value => value !== null)
  if (hasCustomAllocation && allocationValues.some(value => value === null)) {
    throw new Error('Invalid score allocation: automatic and custom values are mixed')
  }

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

  const gradedAnswers = answers.map((answer) => {
    const key = `${answer.q_id}:${answer.sub_id ?? ''}`
    const schemaRow = schemaLookup.get(key)

    if (!schemaRow) {
      return { q_id: answer.q_id, sub_id: answer.sub_id ?? null, is_correct: 0 }
    }

    let is_correct
    if (schemaRow.type === 'mcq') {
      is_correct = gradeMcq(answer.submitted_answer, schemaRow.correct_answer)
    } else if (schemaRow.type === 'numeric') {
      is_correct = gradeNumeric(answer.submitted_answer, schemaRow.correct_answer)
    } else {
      is_correct = gradeBooleanSub(answer.submitted_answer, schemaRow.correct_answer)
    }

    return { q_id: answer.q_id, sub_id: answer.sub_id ?? null, is_correct }
  })

  let earnedPoints = 0
  let maxPossiblePoints = 0

  for (const qid of distinctQids) {
    const schemaRows = schema.filter((r) => r.q_id === qid)
    const type = schemaRows[0]?.type
    const customMaximum = schemaRows[0]?.max_score_hundredths
    if (hasCustomAllocation && schemaRows.some(row => (
      !Number.isInteger(row.max_score_hundredths)
      || row.max_score_hundredths < 1
      || row.max_score_hundredths > 1000
      || row.max_score_hundredths !== customMaximum
    ))) {
      throw new Error(`Invalid score allocation for question ${qid}`)
    }

    if (type === 'boolean') {
      maxPossiblePoints += hasCustomAllocation ? customMaximum : 1.0
      const subAnswers = gradedAnswers.filter((a) => a.q_id === qid)
      const correctCount = subAnswers.filter((a) => a.is_correct === 1).length
      earnedPoints += hasCustomAllocation
        ? customMaximum * (BOOLEAN_SCORE_TABLE[correctCount] ?? 0)
        : BOOLEAN_SCORE_TABLE[correctCount] ?? 0
    } else if (type === 'numeric') {
      const maximum = hasCustomAllocation ? customMaximum : NUMERIC_POINTS
      maxPossiblePoints += maximum
      const ans = gradedAnswers.find((a) => a.q_id === qid)
      earnedPoints += ans?.is_correct === 1 ? maximum : 0
    } else {
      const maximum = hasCustomAllocation ? customMaximum : MCQ_POINTS
      maxPossiblePoints += maximum
      const ans = gradedAnswers.find((a) => a.q_id === qid)
      earnedPoints += ans?.is_correct === 1 ? maximum : 0
    }
  }

  if (hasCustomAllocation && maxPossiblePoints !== 1000) {
    throw new Error('Invalid score allocation: question maxima must total 1000')
  }

  const score = hasCustomAllocation
    ? Math.round(earnedPoints) / 100
    : Math.round((earnedPoints / maxPossiblePoints) * 10 * 100) / 100

  return { gradedAnswers, score }
}
