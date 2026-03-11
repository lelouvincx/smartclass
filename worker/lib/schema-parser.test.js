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

  it('normalizes row values and answer casing', () => {
    const rows = normalizeSchemaRows([
      { q_id: '1', type: 'multiple_choice', correct_answer: 'c', confidence: 0.9 },
      { q_id: '2', type: 'bool', correct_answer: 'T' },
    ])

    expect(rows[0]).toMatchObject({ q_id: 1, type: 'mcq', correct_answer: 'C' })
    expect(rows[1]).toMatchObject({ q_id: 2, type: 'boolean', correct_answer: 'true' })
  })

  it('validates duplicate q_id and invalid answers', () => {
    const errors = validateSchemaRows([
      { q_id: 1, type: 'mcq', correct_answer: 'E', confidence: 0.8 },
      { q_id: 1, type: 'boolean', correct_answer: 'true', confidence: 0.8 },
    ])

    expect(errors).toEqual([
      'Row 1: mcq correct_answer must be A, B, C, or D',
      'Row 2: duplicate q_id 1',
    ])
  })

  it('builds confidence aggregate and warnings', () => {
    const rows = [
      { q_id: 1, confidence: 0.9 },
      { q_id: 2, confidence: 0.7 },
    ]

    const confidence = buildConfidence(rows, 0.75)
    const warnings = buildWarnings(rows, 0.75)

    expect(confidence.overall).toBe(0.8)
    expect(confidence.low_confidence_count).toBe(1)
    expect(warnings).toEqual(['1 question(s) were parsed with confidence below 0.75'])
  })
})
