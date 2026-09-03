import { describe, expect, it } from 'vitest'
import { answerCandidateKey, mergeAnswerCandidates } from './answer-candidates'

const schema = [
  { q_id: 1, sub_id: null, type: 'mcq', correct_answer: 'B' },
  { q_id: 2, sub_id: 'a', type: 'boolean', correct_answer: '1' },
  { q_id: 2, sub_id: 'b', type: 'boolean', correct_answer: '0' },
  { q_id: 3, sub_id: null, type: 'numeric', correct_answer: '42' },
]

function candidate(qId, sourceKind, proposedAnswer, overrides = {}) {
  return {
    q_id: qId,
    sub_id: null,
    type: qId === 3 ? 'numeric' : 'mcq',
    proposed_answer: proposedAnswer,
    source_kind: sourceKind,
    confidence: 0.9,
    ...overrides,
  }
}

describe('mergeAnswerCandidates', () => {
  it('shows agreement, single-source evidence, and missing candidates in one table', () => {
    const result = mergeAnswerCandidates(schema, [
      candidate(1, 'answer_pdf_text', 'B'),
      candidate(1, 'exercise_green_highlight', 'B'),
      candidate(3, 'answer_pdf_text', '42.0'),
    ])

    expect(result.rows.map(row => [row.key, row.status, row.hasConflict])).toEqual([
      ['1:', 'agree', false],
      ['2:a', 'manual', false],
      ['2:b', 'manual', false],
      ['3:', 'answer_pdf', false],
    ])
    expect(result.unexpected).toEqual([])
  })

  it('marks source disagreement, type mismatch, and disagreement with the teacher draft as conflicts', () => {
    const result = mergeAnswerCandidates(schema, [
      candidate(1, 'answer_pdf_text', 'B'),
      candidate(1, 'exercise_green_highlight', 'C'),
      candidate(2, 'answer_pdf_text', '0', { sub_id: 'a', type: 'boolean' }),
      candidate(3, 'answer_pdf_text', '42', { type: 'mcq' }),
    ])

    expect(result.rows.find(row => row.key === '1:')).toMatchObject({
      status: 'conflict',
      hasConflict: true,
    })
    expect(result.rows.find(row => row.key === '2:a')).toMatchObject({
      status: 'conflict',
      hasConflict: true,
    })
    expect(result.rows.find(row => row.key === '3:')).toMatchObject({
      status: 'conflict',
      hasConflict: true,
    })
  })

  it('keeps unexpected Answer PDF rows visible for explicit dismissal', () => {
    const unexpected = candidate(22, 'answer_pdf_text', 'A')

    const result = mergeAnswerCandidates(schema, [unexpected])

    expect(result.unexpected).toEqual([{
      ...unexpected,
      key: '22:',
    }])
    expect(answerCandidateKey(unexpected)).toBe('22:')
  })
})
