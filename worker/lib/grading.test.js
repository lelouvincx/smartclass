import { describe, expect, it } from 'vitest'
import { gradeSubmission } from './grading.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MCQ_SCHEMA = [
  { q_id: 1, sub_id: null, type: 'mcq', correct_answer: 'B' },
]

const NUMERIC_SCHEMA = [
  { q_id: 1, sub_id: null, type: 'numeric', correct_answer: '42' },
]

const BOOLEAN_SCHEMA = [
  { q_id: 1, sub_id: 'a', type: 'boolean', correct_answer: '1' },
  { q_id: 1, sub_id: 'b', type: 'boolean', correct_answer: '0' },
  { q_id: 1, sub_id: 'c', type: 'boolean', correct_answer: '0' },
  { q_id: 1, sub_id: 'd', type: 'boolean', correct_answer: '1' },
]

// Mixed: q_id=1 mcq, q_id=2 boolean, q_id=3 numeric → 3 distinct questions
const MIXED_SCHEMA = [
  { q_id: 1, sub_id: null, type: 'mcq', correct_answer: 'B' },
  { q_id: 2, sub_id: 'a', type: 'boolean', correct_answer: '1' },
  { q_id: 2, sub_id: 'b', type: 'boolean', correct_answer: '0' },
  { q_id: 2, sub_id: 'c', type: 'boolean', correct_answer: '0' },
  { q_id: 2, sub_id: 'd', type: 'boolean', correct_answer: '1' },
  { q_id: 3, sub_id: null, type: 'numeric', correct_answer: '7' },
]

// ── MCQ ───────────────────────────────────────────────────────────────────────

describe('gradeSubmission — MCQ', () => {
  it('marks MCQ answer correct when it matches', () => {
    const { gradedAnswers, score } = gradeSubmission(MCQ_SCHEMA, [
      { q_id: 1, sub_id: null, submitted_answer: 'B' },
    ])
    expect(gradedAnswers[0].is_correct).toBe(1)
    expect(score).toBe(10)
  })

  it('marks MCQ answer wrong when it does not match', () => {
    const { gradedAnswers, score } = gradeSubmission(MCQ_SCHEMA, [
      { q_id: 1, sub_id: null, submitted_answer: 'A' },
    ])
    expect(gradedAnswers[0].is_correct).toBe(0)
    expect(score).toBe(0)
  })

  it('marks skipped MCQ (null) as wrong', () => {
    const { gradedAnswers, score } = gradeSubmission(MCQ_SCHEMA, [
      { q_id: 1, sub_id: null, submitted_answer: null },
    ])
    expect(gradedAnswers[0].is_correct).toBe(0)
    expect(score).toBe(0)
  })
})

// ── Numeric ───────────────────────────────────────────────────────────────────

describe('gradeSubmission — Numeric', () => {
  it('marks numeric correct for exact string match', () => {
    const { gradedAnswers } = gradeSubmission(NUMERIC_SCHEMA, [
      { q_id: 1, sub_id: null, submitted_answer: '42' },
    ])
    expect(gradedAnswers[0].is_correct).toBe(1)
  })

  it('marks numeric correct when value is equal within tolerance (e.g. 42.0 vs 42)', () => {
    const { gradedAnswers } = gradeSubmission(NUMERIC_SCHEMA, [
      { q_id: 1, sub_id: null, submitted_answer: '42.0' },
    ])
    expect(gradedAnswers[0].is_correct).toBe(1)
  })

  it('marks numeric correct for values within rounding tolerance', () => {
    const schema = [{ q_id: 1, sub_id: null, type: 'numeric', correct_answer: '3.14' }]
    const { gradedAnswers } = gradeSubmission(schema, [
      { q_id: 1, sub_id: null, submitted_answer: '3.1400' },
    ])
    expect(gradedAnswers[0].is_correct).toBe(1)
  })

  it('marks numeric wrong when difference exceeds tolerance', () => {
    const schema = [{ q_id: 1, sub_id: null, type: 'numeric', correct_answer: '3.14' }]
    const { gradedAnswers } = gradeSubmission(schema, [
      { q_id: 1, sub_id: null, submitted_answer: '3.20' },
    ])
    expect(gradedAnswers[0].is_correct).toBe(0)
  })

  it('marks skipped numeric (null) as wrong', () => {
    const { gradedAnswers, score } = gradeSubmission(NUMERIC_SCHEMA, [
      { q_id: 1, sub_id: null, submitted_answer: null },
    ])
    expect(gradedAnswers[0].is_correct).toBe(0)
    expect(score).toBe(0)
  })
})

// ── Boolean ───────────────────────────────────────────────────────────────────

describe('gradeSubmission — Boolean', () => {
  it('gives 1.0 point (score=10) when all 4 sub-questions are correct', () => {
    const { gradedAnswers, score } = gradeSubmission(BOOLEAN_SCHEMA, [
      { q_id: 1, sub_id: 'a', submitted_answer: '1' },
      { q_id: 1, sub_id: 'b', submitted_answer: '0' },
      { q_id: 1, sub_id: 'c', submitted_answer: '0' },
      { q_id: 1, sub_id: 'd', submitted_answer: '1' },
    ])
    expect(gradedAnswers.every((a) => a.is_correct === 1)).toBe(true)
    expect(score).toBe(10)
  })

  it('gives 0.5 points when 3 of 4 sub-questions are correct', () => {
    const { gradedAnswers, score } = gradeSubmission(BOOLEAN_SCHEMA, [
      { q_id: 1, sub_id: 'a', submitted_answer: '1' }, // correct
      { q_id: 1, sub_id: 'b', submitted_answer: '0' }, // correct
      { q_id: 1, sub_id: 'c', submitted_answer: '0' }, // correct
      { q_id: 1, sub_id: 'd', submitted_answer: '0' }, // wrong (correct_answer='1')
    ])
    const correctCount = gradedAnswers.filter((a) => a.is_correct === 1).length
    expect(correctCount).toBe(3)
    expect(score).toBe(5) // 0.5 / 1 question * 10
  })

  it('gives 0.25 points when 2 of 4 sub-questions are correct', () => {
    const { score } = gradeSubmission(BOOLEAN_SCHEMA, [
      { q_id: 1, sub_id: 'a', submitted_answer: '1' }, // correct
      { q_id: 1, sub_id: 'b', submitted_answer: '1' }, // wrong (correct_answer='0')
      { q_id: 1, sub_id: 'c', submitted_answer: '1' }, // wrong (correct_answer='0')
      { q_id: 1, sub_id: 'd', submitted_answer: '1' }, // correct
    ])
    expect(score).toBe(2.5) // 0.25 / 1 question * 10
  })

  it('gives 0.1 points when 1 of 4 sub-questions is correct', () => {
    const { score } = gradeSubmission(BOOLEAN_SCHEMA, [
      { q_id: 1, sub_id: 'a', submitted_answer: '1' }, // correct
      { q_id: 1, sub_id: 'b', submitted_answer: '1' }, // wrong
      { q_id: 1, sub_id: 'c', submitted_answer: '1' }, // wrong
      { q_id: 1, sub_id: 'd', submitted_answer: '0' }, // wrong (correct_answer='1')
    ])
    expect(score).toBe(1) // 0.1 / 1 question * 10
  })

  it('gives 0 points when 0 of 4 sub-questions are correct', () => {
    const { score } = gradeSubmission(BOOLEAN_SCHEMA, [
      { q_id: 1, sub_id: 'a', submitted_answer: '0' }, // wrong
      { q_id: 1, sub_id: 'b', submitted_answer: '1' }, // wrong
      { q_id: 1, sub_id: 'c', submitted_answer: '1' }, // wrong
      { q_id: 1, sub_id: 'd', submitted_answer: '0' }, // wrong
    ])
    expect(score).toBe(0)
  })

  it('treats skipped boolean sub-answers (null) as wrong', () => {
    const { gradedAnswers, score } = gradeSubmission(BOOLEAN_SCHEMA, [
      { q_id: 1, sub_id: 'a', submitted_answer: null },
      { q_id: 1, sub_id: 'b', submitted_answer: null },
      { q_id: 1, sub_id: 'c', submitted_answer: null },
      { q_id: 1, sub_id: 'd', submitted_answer: null },
    ])
    expect(gradedAnswers.every((a) => a.is_correct === 0)).toBe(true)
    expect(score).toBe(0)
  })
})

// ── Mixed exercise ────────────────────────────────────────────────────────────

describe('gradeSubmission — mixed exercise', () => {
  it('computes score correctly across MCQ, boolean, and numeric questions', () => {
    // q_id=1 MCQ: correct (0.25 pts earned, 0.25 max)
    // q_id=2 boolean: 3/4 correct (0.5 pts earned, 1.0 max)
    // q_id=3 numeric: wrong (0 pts earned, 0.5 max)
    // max_possible = 0.25 + 1.0 + 0.5 = 1.75
    // score = (0.25 + 0.5 + 0) / 1.75 * 10 = 4.29
    const { score } = gradeSubmission(MIXED_SCHEMA, [
      { q_id: 1, sub_id: null, submitted_answer: 'B' },          // correct
      { q_id: 2, sub_id: 'a', submitted_answer: '1' },           // correct
      { q_id: 2, sub_id: 'b', submitted_answer: '0' },           // correct
      { q_id: 2, sub_id: 'c', submitted_answer: '0' },           // correct
      { q_id: 2, sub_id: 'd', submitted_answer: '0' },           // wrong
      { q_id: 3, sub_id: null, submitted_answer: '99' },         // wrong
    ])
    expect(score).toBe(4.29)
  })

  it('returns score=10 when all answers are correct', () => {
    const { score } = gradeSubmission(MIXED_SCHEMA, [
      { q_id: 1, sub_id: null, submitted_answer: 'B' },
      { q_id: 2, sub_id: 'a', submitted_answer: '1' },
      { q_id: 2, sub_id: 'b', submitted_answer: '0' },
      { q_id: 2, sub_id: 'c', submitted_answer: '0' },
      { q_id: 2, sub_id: 'd', submitted_answer: '1' },
      { q_id: 3, sub_id: null, submitted_answer: '7' },
    ])
    expect(score).toBe(10)
  })

  it('returns score=0 when all answers are wrong', () => {
    const { score } = gradeSubmission(MIXED_SCHEMA, [
      { q_id: 1, sub_id: null, submitted_answer: 'A' },
      { q_id: 2, sub_id: 'a', submitted_answer: '0' },
      { q_id: 2, sub_id: 'b', submitted_answer: '1' },
      { q_id: 2, sub_id: 'c', submitted_answer: '1' },
      { q_id: 2, sub_id: 'd', submitted_answer: '0' },
      { q_id: 3, sub_id: null, submitted_answer: '999' },
    ])
    expect(score).toBe(0)
  })

  it('returns score=0 when no answers submitted (empty array)', () => {
    const { score } = gradeSubmission(MIXED_SCHEMA, [])
    expect(score).toBe(0)
  })

  it('includes is_correct for each submitted answer row', () => {
    const { gradedAnswers } = gradeSubmission(MIXED_SCHEMA, [
      { q_id: 1, sub_id: null, submitted_answer: 'B' },
      { q_id: 2, sub_id: 'a', submitted_answer: '1' },
      { q_id: 2, sub_id: 'b', submitted_answer: '0' },
      { q_id: 2, sub_id: 'c', submitted_answer: '0' },
      { q_id: 2, sub_id: 'd', submitted_answer: '1' },
      { q_id: 3, sub_id: null, submitted_answer: '7' },
    ])
    expect(gradedAnswers).toHaveLength(6)
    gradedAnswers.forEach((a) => {
      expect(a.is_correct).toBeTypeOf('number')
      expect([0, 1]).toContain(a.is_correct)
    })
  })
})
