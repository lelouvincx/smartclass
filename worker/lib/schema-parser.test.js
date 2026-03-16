import { describe, expect, it } from 'vitest'
import {
  buildConfidence,
  buildWarnings,
  normalizeSchemaRows,
  parseModelSchemaContent,
  validateSchemaRows,
} from './schema-parser.js'

describe('schema parser utils', () => {
  it('parses schema wrapped in markdown code fences', () => {
    const content = '```json\n{"schema":[{"q_id":1,"type":"mcq","correct_answer":"b"}]}\n```'
    const rows = parseModelSchemaContent(content)
    expect(rows).toHaveLength(1)
    expect(rows[0].q_id).toBe(1)
  })

  it('normalizes mcq row values and answer casing', () => {
    const rows = normalizeSchemaRows([
      { q_id: '1', type: 'multiple_choice', correct_answer: 'c', confidence: 0.9 },
    ])
    expect(rows[0]).toMatchObject({ q_id: 1, type: 'mcq', correct_answer: 'C' })
  })

  it('normalizes boolean sub-question rows with T/F aliases to 0/1', () => {
    const rows = normalizeSchemaRows([
      { q_id: '2', type: 'bool', sub_id: 'a', correct_answer: 'T' },
      { q_id: '2', type: 'boolean', sub_id: 'b', correct_answer: 'false' },
      { q_id: '2', type: 'boolean', sub_id: 'c', correct_answer: '1' },
      { q_id: '2', type: 'boolean', sub_id: 'd', correct_answer: '0' },
    ])
    expect(rows[0]).toMatchObject({ q_id: 2, type: 'boolean', sub_id: 'a', correct_answer: '1' })
    expect(rows[1]).toMatchObject({ q_id: 2, type: 'boolean', sub_id: 'b', correct_answer: '0' })
    expect(rows[2]).toMatchObject({ q_id: 2, type: 'boolean', sub_id: 'c', correct_answer: '1' })
    expect(rows[3]).toMatchObject({ q_id: 2, type: 'boolean', sub_id: 'd', correct_answer: '0' })
  })

  it('preserves sub_id as null for mcq and numeric rows', () => {
    const rows = normalizeSchemaRows([
      { q_id: '1', type: 'mcq', correct_answer: 'A' },
      { q_id: '3', type: 'numeric', correct_answer: '42' },
    ])
    expect(rows[0].sub_id).toBeNull()
    expect(rows[1].sub_id).toBeNull()
  })

  it('validates duplicate q_id and invalid mcq answer', () => {
    const errors = validateSchemaRows([
      { q_id: 1, type: 'mcq', correct_answer: 'E', sub_id: null, confidence: 0.8 },
      { q_id: 1, type: 'mcq', correct_answer: 'A', sub_id: null, confidence: 0.8 },
    ])

    expect(errors).toContain('Row 1: mcq correct_answer must be A, B, C, or D')
    expect(errors).toContain('Row 2: duplicate q_id 1')
  })

  it('validates boolean sub-question has valid sub_id and 0/1 answer', () => {
    const errors = validateSchemaRows([
      { q_id: 2, type: 'boolean', sub_id: 'a', correct_answer: '1', confidence: 0.9 },
      { q_id: 2, type: 'boolean', sub_id: 'b', correct_answer: '0', confidence: 0.9 },
      { q_id: 2, type: 'boolean', sub_id: 'c', correct_answer: '0', confidence: 0.9 },
      { q_id: 2, type: 'boolean', sub_id: 'd', correct_answer: '1', confidence: 0.9 },
    ])
    expect(errors).toHaveLength(0)
  })

  it('rejects boolean row missing sub_id', () => {
    const errors = validateSchemaRows([
      { q_id: 2, type: 'boolean', sub_id: null, correct_answer: '1', confidence: 0.9 },
    ])
    expect(errors).toContain('Row 1: boolean question must have sub_id (a, b, c, or d)')
  })

  it('rejects boolean row with invalid sub_id', () => {
    const errors = validateSchemaRows([
      { q_id: 2, type: 'boolean', sub_id: 'e', correct_answer: '1', confidence: 0.9 },
    ])
    expect(errors).toContain('Row 1: boolean sub_id must be a, b, c, or d')
  })

  it('rejects boolean row with answer other than 0 or 1', () => {
    const errors = validateSchemaRows([
      { q_id: 2, type: 'boolean', sub_id: 'a', correct_answer: 'true', confidence: 0.9 },
    ])
    expect(errors).toContain('Row 1: boolean correct_answer must be 0 or 1')
  })

  it('rejects boolean question with incomplete sub-questions (not all a,b,c,d)', () => {
    const errors = validateSchemaRows([
      { q_id: 2, type: 'boolean', sub_id: 'a', correct_answer: '1', confidence: 0.9 },
      { q_id: 2, type: 'boolean', sub_id: 'b', correct_answer: '0', confidence: 0.9 },
      // missing c and d
    ])
    expect(errors).toContain('q_id 2: boolean question must have exactly sub-questions a, b, c, d')
  })

  it('rejects duplicate (q_id, sub_id) pair for boolean', () => {
    const errors = validateSchemaRows([
      { q_id: 2, type: 'boolean', sub_id: 'a', correct_answer: '1', confidence: 0.9 },
      { q_id: 2, type: 'boolean', sub_id: 'a', correct_answer: '0', confidence: 0.9 },
      { q_id: 2, type: 'boolean', sub_id: 'c', correct_answer: '0', confidence: 0.9 },
      { q_id: 2, type: 'boolean', sub_id: 'd', correct_answer: '1', confidence: 0.9 },
    ])
    expect(errors).toContain('Row 2: duplicate (q_id, sub_id) pair (2, a)')
  })

  it('builds confidence aggregate and warnings', () => {
    const rows = [
      { q_id: 1, sub_id: null, confidence: 0.9 },
      { q_id: 2, sub_id: 'a', confidence: 0.7 },
      { q_id: 2, sub_id: 'b', confidence: 0.7 },
      { q_id: 2, sub_id: 'c', confidence: 0.7 },
      { q_id: 2, sub_id: 'd', confidence: 0.7 },
    ]

    const confidence = buildConfidence(rows, 0.75)
    const warnings = buildWarnings(rows, 0.75)

    expect(confidence.overall).toBeGreaterThan(0)
    expect(confidence.low_confidence_count).toBe(4)
    expect(warnings).toEqual(['4 question(s) were parsed with confidence below 0.75'])
  })
})
