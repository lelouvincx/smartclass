import { describe, expect, it } from 'vitest'
import {
  applyScoreAllocation,
  distributeEqualPoints,
  distributeTypeProportions,
  parsePointsToHundredths,
  validateCustomAllocation,
} from './score-allocation'

const rows = [
  { q_id: 3, type: 'boolean', sub_id: 'a' },
  { q_id: 3, type: 'boolean', sub_id: 'b' },
  { q_id: 1, type: 'mcq' },
  { q_id: 2, type: 'numeric' },
]

describe('score allocation', () => {
  it('distributes equal integer hundredths deterministically across distinct questions', () => {
    expect(distributeEqualPoints(rows)).toEqual({ 1: 334, 2: 333, 3: 333 })
  })

  it('uses largest remainders and ascending q_id ties for type proportions', () => {
    expect(distributeTypeProportions(rows)).toEqual({ 1: 143, 2: 286, 3: 571 })
  })

  it('makes type proportions unavailable if a question would receive zero', () => {
    const manyRows = Array.from({ length: 1000 }, (_, index) => ({
      q_id: index + 1,
      type: index === 999 ? 'boolean' : 'mcq',
    }))
    expect(distributeTypeProportions(manyRows)).toBeNull()
  })

  it('accepts at most 2 decimals and validates the exact 10 point total', () => {
    expect(parsePointsToHundredths('1.25')).toBe(125)
    expect(parsePointsToHundredths('1.001')).toBeNull()
    expect(validateCustomAllocation(rows, { 1: '1.43', 2: '2.86', 3: '5.71' })).toMatchObject({
      valid: true,
      totalHundredths: 1000,
    })
    expect(validateCustomAllocation(rows, { 1: '0', 2: '2.86', 3: '5.71' })).toMatchObject({
      valid: false,
      errors: { 1: 'range' },
    })
  })

  it('applies one custom value to every boolean subrow and nulls automatic rows', () => {
    expect(applyScoreAllocation(rows, 'custom', { 1: '1.43', 2: '2.86', 3: '5.71' }))
      .toEqual([
        { ...rows[0], max_score_hundredths: 571 },
        { ...rows[1], max_score_hundredths: 571 },
        { ...rows[2], max_score_hundredths: 143 },
        { ...rows[3], max_score_hundredths: 286 },
      ])
    expect(applyScoreAllocation(rows, 'automatic', {}))
      .toEqual(rows.map(row => ({ ...row, max_score_hundredths: null })))
  })
})
