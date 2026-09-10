import { canAccessAuthPath, getDefaultPathForAuth } from './navigation'

describe('navigation auth contract', () => {
  it('derives a fresh destination instead of trusting cached flags and paths', () => {
    expect(getDefaultPathForAuth({
      defaultPath: '/', canManage: true, isActiveStudent: true,
      user: { platform_role: 'user', disabled_at: null }, membership: null,
    })).toBe('/join')
    const blocked = {
      user: { platform_role: 'platform_admin', disabled_at: '2026-09-10' },
      membership: { role: 'teacher', status: 'active' },
    }
    expect(canAccessAuthPath(blocked, '/teacher')).toBe(false)
  })

  it('allows an administrator enrolled as a student to use either explicit permission', () => {
    expect(canAccessAuthPath({
      user: { platform_role: 'platform_admin', disabled_at: null },
      membership: { role: 'student', status: 'active' },
    }, '/student/exercises')).toBe(true)
  })

  it('routes from explicit workspace membership and platform role only', () => {
    expect(getDefaultPathForAuth({
      user: { platform_role: 'user', disabled_at: null },
      membership: { role: 'teacher', status: 'active' },
    })).toBe('/teacher')
    expect(getDefaultPathForAuth({
      user: { platform_role: 'platform_admin', disabled_at: null },
      membership: null,
    })).toBe('/teacher')
    expect(getDefaultPathForAuth({
      user: { platform_role: 'user', disabled_at: null },
      membership: { role: 'student', status: 'active' },
    })).toBe('/student')
    expect(getDefaultPathForAuth({
      user: { role: 'teacher', platform_role: 'user', disabled_at: null },
      membership: null,
    })).toBe('/join')
  })

  it('guards teacher and student paths without legacy role fallback', () => {
    const teacher = { user: { platform_role: 'user' }, membership: { role: 'teacher', status: 'active' } }
    const student = { user: { platform_role: 'user', disabled_at: null }, membership: { role: 'student', status: 'active' } }
    const noMembership = { user: { role: 'teacher', platform_role: 'user' }, membership: null }

    expect(canAccessAuthPath(teacher, '/teacher/exercises')).toBe(true)
    expect(canAccessAuthPath(teacher, '/student/submissions')).toBe(false)
    expect(canAccessAuthPath(student, '/student/submissions')).toBe(true)
    expect(canAccessAuthPath(student, '/teacher/exercises')).toBe(false)
    expect(canAccessAuthPath(noMembership, '/teacher')).toBe(false)
  })
})
