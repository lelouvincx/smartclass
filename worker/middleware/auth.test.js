import { describe, it, expect, vi } from 'vitest'
import { requireAuth, requireRole } from './auth.js'

function createMockContext(overrides = {}) {
  const jsonResponse = { json: true }
  return {
    env: { JWT_SECRET: 'test-secret', ...overrides.env },
    req: {
      header: vi.fn().mockReturnValue(overrides.authorization || ''),
    },
    json: vi.fn().mockReturnValue(jsonResponse),
    get: vi.fn().mockReturnValue(overrides.authUser || null),
    set: vi.fn(),
  }
}

describe('requireAuth', () => {
  it('returns 500 if JWT_SECRET is missing', async () => {
    const c = createMockContext({ env: { JWT_SECRET: undefined } })
    const next = vi.fn()

    await requireAuth(c, next)

    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'MISSING_JWT_SECRET' }),
      }),
      500,
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 if Authorization header is missing', async () => {
    const c = createMockContext()
    const next = vi.fn()

    await requireAuth(c, next)

    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
      }),
      401,
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 if Authorization header does not start with Bearer', async () => {
    const c = createMockContext({ authorization: 'Basic abc123' })
    const next = vi.fn()

    await requireAuth(c, next)

    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
      }),
      401,
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 if token verification fails', async () => {
    const c = createMockContext({ authorization: 'Bearer invalid-token' })
    const next = vi.fn()

    await requireAuth(c, next)

    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
      }),
      401,
    )
    expect(next).not.toHaveBeenCalled()
  })
})

describe('requireRole', () => {
  it('returns 403 if authUser is null', async () => {
    const c = createMockContext()
    const next = vi.fn()

    const middleware = requireRole('teacher')
    await middleware(c, next)

    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      }),
      403,
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 403 if role does not match', async () => {
    const c = createMockContext({ authUser: { id: 1, role: 'student' } })
    const next = vi.fn()

    const middleware = requireRole('teacher')
    await middleware(c, next)

    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      }),
      403,
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('calls next if role matches', async () => {
    const c = createMockContext({ authUser: { id: 1, role: 'teacher' } })
    const next = vi.fn()

    const middleware = requireRole('teacher')
    await middleware(c, next)

    expect(next).toHaveBeenCalled()
    expect(c.json).not.toHaveBeenCalled()
  })
})
