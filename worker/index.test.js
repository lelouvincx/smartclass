import { afterEach, describe, expect, it, vi } from 'vitest'
import app from './index.js'
import { createMockEnv } from './test/setup.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('application maintenance', () => {
  it('blocks reads, writes and alternate hosts before database access', async () => {
    const env = createMockEnv({
      APP_ENV: 'production',
      APP_MAINTENANCE: 'true',
      DB: new Proxy({}, { get() { throw new Error('Maintenance must not access D1') } }),
    })
    for (const origin of ['https://api.toanthaythanh.com', 'https://api.tienganhcothuy.com', 'https://old.example.workers.dev']) {
      for (const [method, path] of [['GET', '/api/lectures'], ['POST', '/api/auth/register'], ['PUT', '/api/exercises/1'], ['POST', '/api/health'], ['GET', '/api/version/extra']]) {
        const response = await app.request(`${origin}${path}`, { method }, env)
        expect(response.status).toBe(503)
        expect(response.headers.get('Cache-Control')).toBe('no-store')
        expect(response.headers.get('Retry-After')).toBe('60')
        expect(await response.json()).toMatchObject({ error: { code: 'MAINTENANCE' } })
      }
    }
  })

  it('keeps exact GET diagnostics available and reports maintenance state', async () => {
    for (const enabled of ['true', 'false']) {
      const env = createMockEnv({ APP_MAINTENANCE: enabled })
      const health = await app.request('/api/health', {}, env)
      expect(health.status).toBe(200)
      expect((await health.json()).data.maintenance).toBe(enabled === 'true')
      expect((await app.request('/api/version', {}, env)).status).toBe(200)
    }
  })

  it('allows the matching browser to read the maintenance response', async () => {
    const response = await app.request('https://api.tienganhcothuy.com/api/lectures', {
      headers: { Origin: 'https://tienganhcothuy.com' },
    }, createMockEnv({ APP_ENV: 'production', APP_MAINTENANCE: 'true' }))
    expect(response.status).toBe(503)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://tienganhcothuy.com')
  })
})

describe('GET /api/version', () => {
  it('returns the deployed commit hash', async () => {
    const env = createMockEnv({ APP_COMMIT_SHA: '0123456789abcdef0123456789abcdef01234567' })

    const response = await app.request('/api/version', {}, env)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({
      success: true,
      data: {
        commit: '0123456789abcdef0123456789abcdef01234567',
      },
    })
  })
})

describe('structured production logging', () => {
  it('stays silent unless explicitly enabled', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await app.request('/api/version', {}, createMockEnv())

    expect(response.status).toBe(200)
    expect(info).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('emits one direct object for successful requests', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const env = createMockEnv({
      APP_STRUCTURED_LOGS: 'true',
      APP_COMMIT_SHA: 'b'.repeat(40),
    })

    const response = await app.request('/api/version', {}, env)

    expect(response.status).toBe(200)
    expect(info).toHaveBeenCalledTimes(1)
    const record = info.mock.calls[0][0]
    expect(typeof record).toBe('object')
    expect(typeof record).not.toBe('string')
    expect(record).toMatchObject({
      schema_version: 1,
      event: 'http.request.completed',
      method: 'GET',
      route: '/api/version',
      status: 200,
      workspace_id: null,
      commit: 'b'.repeat(40),
    })
    expect(record.handler_duration_ms).toEqual(expect.any(Number))
  })

  it('logs handled maintenance and not-found errors with error codes', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const maintenance = await app.request('https://api.toanthaythanh.com/api/lectures', {}, createMockEnv({
      APP_MAINTENANCE: 'true',
      APP_STRUCTURED_LOGS: 'true',
      DB: new Proxy({}, { get() { throw new Error('D1 must not be touched') } }),
    }))
    const notFound = await app.request('/missing-route', {}, createMockEnv({ APP_STRUCTURED_LOGS: 'true' }))

    expect(maintenance.status).toBe(503)
    expect(notFound.status).toBe(404)
    expect(info).toHaveBeenCalledTimes(2)
    expect(info.mock.calls[0][0]).toMatchObject({ status: 503, error_code: 'MAINTENANCE' })
    expect(info.mock.calls[1][0]).toMatchObject({ status: 404, error_code: 'NOT_FOUND', route: 'unmatched' })
  })

  it('logs uncaught errors without raw URL, headers, body, or exception message', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const secret = 'sentinel-secret-value'
    const env = createMockEnv({
      APP_ENV: 'production',
      APP_STRUCTURED_LOGS: 'true',
      DB: new Proxy({}, { get() { throw new Error(secret) } }),
    })

    const response = await app.request(`https://api.toanthaythanh.com/api/public/exercises/123?token=${secret}`, {
      headers: {
        Cookie: `session=${secret}`,
      },
    }, env)

    expect(response.status).toBe(500)
    expect(error).toHaveBeenCalledTimes(1)
    const record = error.mock.calls[0][0]
    expect(record).toMatchObject({
      event: 'http.request.completed',
      route: '/api/public/exercises/:id',
      status: 500,
      error_code: 'INTERNAL_SERVER_ERROR',
      exception_type: 'Error',
      workspace_id: 'maths',
    })
    expect(JSON.stringify(record)).not.toContain(secret)
    expect(JSON.stringify(record)).not.toContain('Authorization')
    expect(JSON.stringify(record)).not.toContain('Cookie')
    expect(JSON.stringify(record)).not.toContain('token=')
  })
})

describe('production CORS', () => {
  it('allows the production frontend when the deployment variable is stale', async () => {
    const env = createMockEnv({
      APP_ENV: 'production',
      APP_CORS_ORIGIN: 'https://smartclass.lelouvincx.com',
    })

    const response = await app.request('https://api.toanthaythanh.com/api/auth/google/login', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://toanthaythanh.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    }, env)

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://toanthaythanh.com')
  })

  it('allows the alternate production frontend domain', async () => {
    const env = createMockEnv({ APP_ENV: 'production' })

    const response = await app.request('https://api.tienganhcothuy.com/api/auth/google/login', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://tienganhcothuy.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    }, env)

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://tienganhcothuy.com')
  })

  it('rejects foreign hosts and mismatched browser origins before product handlers', async () => {
    const env = createMockEnv({ APP_ENV: 'production' })
    const foreign = await app.request('https://unknown.workers.dev/api/auth/login', { method: 'POST' }, env)
    expect(foreign.status).toBe(404)
    expect(await foreign.json()).toMatchObject({ error: { code: 'UNSUPPORTED_SITE' } })
    const mismatched = await app.request('https://api.toanthaythanh.com/api/auth/login', {
      method: 'POST', headers: { Origin: 'https://tienganhcothuy.com' },
    }, env)
    expect(mismatched.status).toBe(403)
    expect(await mismatched.json()).toMatchObject({ error: { code: 'ORIGIN_NOT_ALLOWED' } })
  })

  it('rejects foreign-workspace and legacy tokens through the final app', async () => {
    const { sign } = await import('hono/jwt')
    const env = createMockEnv({ APP_ENV: 'test' })
    const now = Math.floor(Date.now() / 1000)
    for (const claims of [{ workspace_id: 'english' }, { role: 'teacher' }]) {
      const token = await sign({ sub: '1', iat: now, exp: now + 60, ...claims }, env.JWT_SECRET, 'HS256')
      const response = await app.request('http://maths-api.test/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      }, env)
      expect(response.status).toBe(401)
      expect(await response.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } })
    }
  })
})
