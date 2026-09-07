import { canAccessRolePath, getDefaultPathForRole } from './navigation'

describe('navigation helpers', () => {
  it('returns default path for known roles', () => {
    expect(getDefaultPathForRole('teacher')).toBe('/teacher')
    expect(getDefaultPathForRole('student')).toBe('/student')
    expect(getDefaultPathForRole('unknown')).toBe('/')
  })

  it('checks role path access permissions', () => {
    expect(canAccessRolePath('teacher', '/teacher')).toBe(true)
    expect(canAccessRolePath('teacher', '/student')).toBe(false)
    expect(canAccessRolePath('student', '/teacher')).toBe(false)
    expect(canAccessRolePath('student', '/student')).toBe(true)
  })

  it('checks nested role path access permissions', () => {
    expect(canAccessRolePath('teacher', '/teacher/exercises')).toBe(true)
    expect(canAccessRolePath('teacher', '/student/submissions')).toBe(false)
    expect(canAccessRolePath('student', '/student/submissions')).toBe(true)
    expect(canAccessRolePath('student', '/teacher/exercises')).toBe(false)
  })
})
