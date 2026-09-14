import { describe, expect, it } from 'vitest'
import { parseGrades } from './grades.js'

describe('parseGrades', () => {
  it('accepts and consistently orders the THPT access class for maths workspaces only', () => {
    expect(parseGrades(['dgnl', 12, 'thpt', 11, 10, 'thpt'], { workspaceId: 'maths' })).toEqual({
      grades: [10, 11, 12, 'thpt', 'dgnl'],
    })
    expect(parseGrades(['thpt'], { workspaceId: 'english' })).toEqual({
      error: 'grades must be a non-empty array containing only 10, 11, 12, or dgnl',
    })
  })

  it('accepts and consistently orders the ĐGNL access class', () => {
    expect(parseGrades(['dgnl', 11, 10, 'dgnl'])).toEqual({
      grades: [10, 11, 'dgnl'],
    })
  })

  it('preserves the legacy four-class default unless the caller opts into maths programmes', () => {
    expect(parseGrades(undefined, { defaultToAll: true })).toEqual({
      grades: [10, 11, 12, 'dgnl'],
    })
    expect(parseGrades(undefined, { defaultToAll: true, workspaceId: 'maths' })).toEqual({
      grades: [10, 11, 12, 'thpt', 'dgnl'],
    })
  })

  it('rejects unknown access classes', () => {
    expect(parseGrades(['other'])).toEqual({
      error: 'grades must be a non-empty array containing only 10, 11, 12, or dgnl',
    })
  })
})
