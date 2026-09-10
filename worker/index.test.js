import { describe, expect, it } from 'vitest'
import app from './index.js'
import { createMockEnv } from './test/setup.js'

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
