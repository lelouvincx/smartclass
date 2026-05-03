import { describe, it, expect } from 'vitest'
import { validateExtractedAnswers, ExtractParseError } from './extract-validator.js'

const baseSchema = [
  { q_id: 1, sub_id: null, type: 'mcq' },
  { q_id: 2, sub_id: 'a', type: 'boolean' },
  { q_id: 2, sub_id: 'b', type: 'boolean' },
  { q_id: 2, sub_id: 'c', type: 'boolean' },
  { q_id: 2, sub_id: 'd', type: 'boolean' },
  { q_id: 3, sub_id: null, type: 'numeric' },
]

describe('validateExtractedAnswers', () => {
  describe('parsing', () => {
    it('parses a clean JSON object with answers array', () => {
      const content = JSON.stringify({
        answers: [
          { q_id: 1, answer: 'B', confidence: 0.9 },
          { q_id: 3, answer: '42', confidence: 0.8 },
        ],
      })
      const { answers, warnings } = validateExtractedAnswers(content, baseSchema)
      expect(warnings).toEqual([])
      expect(answers).toHaveLength(6)
      const mcq = answers.find((a) => a.q_id === 1 && a.sub_id === null)
      expect(mcq).toEqual({ q_id: 1, sub_id: null, answer: 'B', confidence: 0.9 })
    })

    it('accepts a top-level array as well as { answers: [...] }', () => {
      const content = JSON.stringify([{ q_id: 1, answer: 'A', confidence: 0.9 }])
      const { answers } = validateExtractedAnswers(content, baseSchema)
      expect(answers.find((a) => a.q_id === 1).answer).toBe('A')
    })

    it('strips ```json code fences before parsing', () => {
      const content = '```json\n{"answers":[{"q_id":1,"answer":"C","confidence":0.7}]}\n```'
      const { answers } = validateExtractedAnswers(content, baseSchema)
      expect(answers.find((a) => a.q_id === 1).answer).toBe('C')
    })

    it('throws ExtractParseError for malformed JSON', () => {
      expect(() => validateExtractedAnswers('not json', baseSchema)).toThrow(ExtractParseError)
    })

    it('throws ExtractParseError when payload has no answers array', () => {
      expect(() => validateExtractedAnswers(JSON.stringify({ foo: 1 }), baseSchema)).toThrow(ExtractParseError)
    })
  })

  describe('schema filtering', () => {
    it('drops rows whose q_id is not in the schema, with a warning', () => {
      const content = JSON.stringify({
        answers: [
          { q_id: 1, answer: 'A', confidence: 0.9 },
          { q_id: 99, answer: 'B', confidence: 0.9 },
        ],
      })
      const { answers, warnings } = validateExtractedAnswers(content, baseSchema)
      expect(warnings.some((w) => w.includes('Q99'))).toBe(true)
      expect(answers.find((a) => a.q_id === 99)).toBeUndefined()
    })

    it('drops rows whose (q_id, sub_id) does not match a boolean sub-question', () => {
      const content = JSON.stringify({
        answers: [{ q_id: 2, sub_id: 'z', answer: '1', confidence: 0.9 }],
      })
      const { warnings, answers } = validateExtractedAnswers(content, baseSchema)
      expect(warnings.some((w) => w.includes('sub z'))).toBe(true)
      // All boolean subs are backfilled with null
      expect(answers.filter((a) => a.q_id === 2)).toHaveLength(4)
      expect(answers.filter((a) => a.q_id === 2).every((a) => a.answer === null)).toBe(true)
    })

    it('warns and drops on duplicate (q_id, sub_id) rows', () => {
      const content = JSON.stringify({
        answers: [
          { q_id: 1, answer: 'A', confidence: 0.9 },
          { q_id: 1, answer: 'B', confidence: 0.5 },
        ],
      })
      const { answers, warnings } = validateExtractedAnswers(content, baseSchema)
      expect(answers.find((a) => a.q_id === 1).answer).toBe('A')
      expect(warnings.some((w) => w.toLowerCase().includes('duplicate'))).toBe(true)
    })
  })

  describe('per-type normalization', () => {
    it('uppercases MCQ answers', () => {
      const content = JSON.stringify({ answers: [{ q_id: 1, answer: 'b', confidence: 0.9 }] })
      const { answers } = validateExtractedAnswers(content, baseSchema)
      expect(answers.find((a) => a.q_id === 1).answer).toBe('B')
    })

    it('coerces boolean variants to "1"/"0"', () => {
      const content = JSON.stringify({
        answers: [
          { q_id: 2, sub_id: 'a', answer: 'True', confidence: 0.9 },
          { q_id: 2, sub_id: 'b', answer: 'F', confidence: 0.9 },
          { q_id: 2, sub_id: 'c', answer: 'yes', confidence: 0.9 },
          { q_id: 2, sub_id: 'd', answer: '0', confidence: 0.9 },
        ],
      })
      const { answers } = validateExtractedAnswers(content, baseSchema)
      const subs = Object.fromEntries(
        answers.filter((a) => a.q_id === 2).map((a) => [a.sub_id, a.answer])
      )
      expect(subs).toEqual({ a: '1', b: '0', c: '1', d: '0' })
    })

    it('drops MCQ answers that are not A/B/C/D, with warning', () => {
      const content = JSON.stringify({ answers: [{ q_id: 1, answer: 'E', confidence: 0.9 }] })
      const { answers, warnings } = validateExtractedAnswers(content, baseSchema)
      expect(answers.find((a) => a.q_id === 1).answer).toBeNull()
      expect(warnings.some((w) => w.includes('not a valid MCQ'))).toBe(true)
    })

    it('drops boolean answers that are not 0/1 after normalization', () => {
      const content = JSON.stringify({
        answers: [{ q_id: 2, sub_id: 'a', answer: 'maybe', confidence: 0.9 }],
      })
      const { answers, warnings } = validateExtractedAnswers(content, baseSchema)
      expect(answers.find((a) => a.q_id === 2 && a.sub_id === 'a').answer).toBeNull()
      expect(warnings.some((w) => w.toLowerCase().includes('boolean'))).toBe(true)
    })

    it('keeps numeric strings as-is and trims whitespace', () => {
      const content = JSON.stringify({ answers: [{ q_id: 3, answer: '  42 ', confidence: 0.9 }] })
      const { answers } = validateExtractedAnswers(content, baseSchema)
      expect(answers.find((a) => a.q_id === 3).answer).toBe('42')
    })

    it('warns when numeric is unparseable but keeps the raw string', () => {
      const content = JSON.stringify({ answers: [{ q_id: 3, answer: 'forty', confidence: 0.9 }] })
      const { answers, warnings } = validateExtractedAnswers(content, baseSchema)
      expect(answers.find((a) => a.q_id === 3).answer).toBe('forty')
      expect(warnings.some((w) => w.includes('numeric'))).toBe(true)
    })
  })

  describe('confidence', () => {
    it('clamps confidence to [0,1]', () => {
      const content = JSON.stringify({
        answers: [
          { q_id: 1, answer: 'A', confidence: 1.5 },
          { q_id: 3, answer: '1', confidence: -0.4 },
        ],
      })
      const { answers } = validateExtractedAnswers(content, baseSchema)
      expect(answers.find((a) => a.q_id === 1).confidence).toBe(1)
      expect(answers.find((a) => a.q_id === 3).confidence).toBe(0)
    })

    it('treats non-numeric confidence as 0', () => {
      const content = JSON.stringify({ answers: [{ q_id: 1, answer: 'A', confidence: 'high' }] })
      const { answers } = validateExtractedAnswers(content, baseSchema)
      expect(answers.find((a) => a.q_id === 1).confidence).toBe(0)
    })

    it('caps confidence at 0.3 when answer is null/blank', () => {
      const content = JSON.stringify({ answers: [{ q_id: 1, answer: null, confidence: 0.99 }] })
      const { answers } = validateExtractedAnswers(content, baseSchema)
      const row = answers.find((a) => a.q_id === 1)
      expect(row.answer).toBeNull()
      expect(row.confidence).toBeLessThanOrEqual(0.3)
    })
  })

  describe('backfill', () => {
    it('fills omitted schema rows with null answer + 0 confidence', () => {
      const content = JSON.stringify({ answers: [{ q_id: 1, answer: 'A', confidence: 0.9 }] })
      const { answers } = validateExtractedAnswers(content, baseSchema)
      expect(answers).toHaveLength(6)
      const numeric = answers.find((a) => a.q_id === 3)
      expect(numeric).toEqual({ q_id: 3, sub_id: null, answer: null, confidence: 0 })
      const boolA = answers.find((a) => a.q_id === 2 && a.sub_id === 'a')
      expect(boolA).toEqual({ q_id: 2, sub_id: 'a', answer: null, confidence: 0 })
    })

    it('returns one entry per schema row, sorted by (q_id, sub_id)', () => {
      const { answers } = validateExtractedAnswers(JSON.stringify({ answers: [] }), baseSchema)
      expect(answers.map((a) => `${a.q_id}:${a.sub_id ?? ''}`)).toEqual([
        '1:', '2:a', '2:b', '2:c', '2:d', '3:',
      ])
    })

    it('handles empty schema', () => {
      const { answers, warnings } = validateExtractedAnswers(
        JSON.stringify({ answers: [{ q_id: 1, answer: 'A' }] }),
        []
      )
      expect(answers).toEqual([])
      expect(warnings.some((w) => w.includes('Q1'))).toBe(true)
    })
  })

  describe('robustness', () => {
    it('drops rows with non-integer q_id', () => {
      const content = JSON.stringify({
        answers: [
          { q_id: 'foo', answer: 'A' },
          { q_id: 1, answer: 'B', confidence: 0.9 },
        ],
      })
      const { answers, warnings } = validateExtractedAnswers(content, baseSchema)
      expect(answers.find((a) => a.q_id === 1).answer).toBe('B')
      expect(warnings.some((w) => w.toLowerCase().includes('non-integer'))).toBe(true)
    })

    it('parses string q_ids that are integer-looking', () => {
      const content = JSON.stringify({
        answers: [{ q_id: '1', answer: 'C', confidence: 0.85 }],
      })
      const { answers } = validateExtractedAnswers(content, baseSchema)
      expect(answers.find((a) => a.q_id === 1).answer).toBe('C')
    })
  })
})
