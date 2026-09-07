import { describe, expect, it } from 'vitest'
import { parseGrades } from './grades.js'

describe('parseGrades', () => {
  it('accepts and consistently orders the ĐGNL access class', () => {
    expect(parseGrades(['dgnl', 11, 10, 'dgnl'])).toEqual({
      grades: [10, 11, 'dgnl'],
    })
  })

  it('includes ĐGNL when access defaults to every class', () => {
    expect(parseGrades(undefined, { defaultToAll: true })).toEqual({
      grades: [10, 11, 12, 'dgnl'],
    })
  })

  it('rejects unknown access classes', () => {
    expect(parseGrades(['other'])).toEqual({
      error: 'grades must be a non-empty array containing only 10, 11, 12, or dgnl',
    })
  })
})
