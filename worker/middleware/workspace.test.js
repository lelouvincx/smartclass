import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { getWorkspaceSites } from '../lib/workspaces.js'
import { requireWorkspace } from './workspace.js'

function createApp(handler = (c) => c.json({ success: true, data: { workspace: c.get('workspace') } })) {
  const app = new Hono()

  app.use('/api/*', requireWorkspace)
  app.all('/api/health', handler)
  app.all('/api/version', handler)
  app.all('/api/write', handler)
  app.all('/api/lectures', handler)
  app.all('/api/auth/me', handler)

  return app
}

function request(url, init = {}, env = { APP_ENV: 'test' }, handler) {
  return createApp(handler).request(url, init, env)
}

describe('getWorkspaceSites', () => {
  it('returns frozen production sites with exact Google callback URLs', () => {
    const sites = getWorkspaceSites({ APP_ENV: 'production' })

    expect(Object.isFrozen(sites)).toBe(true)
    expect(sites.every((site) => Object.isFrozen(site) && Object.getPrototypeOf(site) === Object.prototype)).toBe(true)
    expect(sites).toEqual([
      {
        id: 'maths',
        frontend_origin: 'https://toanthaythanh.com',
        api_origin: 'https://api.toanthaythanh.com',
        google_redirect_uri: 'https://toanthaythanh.com/auth/google/callback',
      },
      {
        id: 'english',
        frontend_origin: 'https://tienganhcothuy.com',
        api_origin: 'https://api.tienganhcothuy.com',
        google_redirect_uri: 'https://tienganhcothuy.com/auth/google/callback',
      },
    ])
  })

  it('uses explicit development sites when APP_ENV is absent or development', () => {
    expect(getWorkspaceSites({})).toEqual(getWorkspaceSites({ APP_ENV: 'development' }))
    expect(getWorkspaceSites({}).map((site) => [site.id, site.frontend_origin, site.api_origin])).toEqual([
      ['maths', 'http://localhost:5173', 'http://localhost:8787'],
      ['english', 'http://localhost:5174', 'http://localhost:8788'],
    ])
  })

  it('uses explicit test sites and fails closed for unknown environments', () => {
    expect(getWorkspaceSites({ APP_ENV: 'test' }).map((site) => [site.id, site.frontend_origin, site.api_origin])).toEqual([
      ['maths', 'http://maths.test', 'http://maths-api.test'],
      ['english', 'http://english.test', 'http://english-api.test'],
    ])
    expect(getWorkspaceSites({ APP_ENV: 'preview' })).toEqual([])
    expect(getWorkspaceSites({ APP_ENV: 'toString' })).toEqual([])
    expect(getWorkspaceSites({ APP_ENV: '' })).toEqual([])
  })
})

describe('requireWorkspace', () => {
  it('selects unequal maths and English workspaces by exact request URL origin', async () => {
    const maths = await request('http://maths-api.test/api/lectures', {
      headers: { Origin: 'http://maths.test' },
    })
    const english = await request('http://english-api.test/api/lectures', {
      headers: { Origin: 'http://english.test' },
    })

    expect(maths.status).toBe(200)
    expect((await maths.json()).data.workspace.id).toBe('maths')
    expect(maths.headers.get('Access-Control-Allow-Origin')).toBe('http://maths.test')
    expect(english.status).toBe(200)
    expect((await english.json()).data.workspace.id).toBe('english')
    expect(english.headers.get('Access-Control-Allow-Origin')).toBe('http://english.test')
  })

  it('ignores forged workspace, Host, and forwarded headers in favor of URL origin', async () => {
    const response = await request('http://maths-api.test/api/lectures', {
      headers: {
        Origin: 'http://maths.test',
        'x-workspace': 'english',
        Host: 'english-api.test',
        'x-forwarded-host': 'english-api.test',
        'x-forwarded-proto': 'https',
      },
    })

    expect(response.status).toBe(200)
    expect((await response.json()).data.workspace.id).toBe('maths')
  })

  it('rejects deceptive suffix API URLs instead of suffix-matching hosts', async () => {
    const response = await request('http://maths-api.test.evil.test/api/lectures', {
      headers: { Origin: 'http://maths.test' },
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ success: false, error: { code: 'UNSUPPORTED_SITE' } })
  })

  it('rejects mismatched origins on writes before invoking the handler', async () => {
    const handler = vi.fn((c) => c.json({ success: true }))

    const response = await request('http://maths-api.test/api/write', {
      method: 'POST',
      headers: { Origin: 'http://english.test' },
    }, { APP_ENV: 'test' }, handler)

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ success: false, error: { code: 'ORIGIN_NOT_ALLOWED' } })
    expect(handler).not.toHaveBeenCalled()
  })

  it('handles matching preflights with the existing allowed CORS shape', async () => {
    const handler = vi.fn((c) => c.json({ success: true }))

    const response = await request('http://english-api.test/api/write', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://english.test',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,authorization,x-r2-key,x-file-type,x-file-name',
      },
    }, { APP_ENV: 'test' }, handler)

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://english.test')
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type,Authorization,x-r2-key,x-file-type,x-file-name')
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET,POST,PUT,PATCH,DELETE,OPTIONS')
    expect(response.headers.get('Access-Control-Expose-Headers')).toBe('Content-Length')
    expect(response.headers.get('Access-Control-Max-Age')).toBe('600')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('Vary')).toContain('Origin')
    expect(handler).not.toHaveBeenCalled()
  })

  it('rejects empty, null, and malformed Origin headers', async () => {
    for (const origin of ['', 'null', 'notaurl']) {
      const response = await request('http://maths-api.test/api/write', {
        method: 'POST',
        headers: { Origin: origin },
      })

      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({ success: false, error: { code: 'ORIGIN_NOT_ALLOWED' } })
    }
  })

  it('rejects unknown workers.dev product hosts', async () => {
    const response = await request('https://smartclass-api.lelouvincx.workers.dev/api/lectures')

    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('Vary')).toBe('Origin')
    expect(await response.json()).toMatchObject({ success: false, error: { code: 'UNSUPPORTED_SITE' } })
  })

  it('rejects test hosts in production', async () => {
    const response = await request('http://maths-api.test/api/lectures', {}, { APP_ENV: 'production' })

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ success: false, error: { code: 'UNSUPPORTED_SITE' } })
  })

  it('allows missing Origin without bypassing downstream auth', async () => {
    const handler = vi.fn((c) => c.json({
      success: false,
      error: { code: c.get('workspace') ? 'UNAUTHORIZED' : 'NO_WORKSPACE' },
    }, 401))

    const response = await request('http://maths-api.test/api/auth/me', {}, { APP_ENV: 'test' }, handler)

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } })
    expect(handler).toHaveBeenCalledOnce()
  })

  it('bypasses workspace mapping only for exact health and version GET routes', async () => {
    const health = await request('https://unknown.workers.dev/api/health')
    const version = await request('https://unknown.workers.dev/api/version')
    const prefixed = await request('https://unknown.workers.dev/api/health/details')

    expect(health.status).toBe(200)
    expect(health.headers.get('Cache-Control')).toBe('no-store')
    expect((await health.json()).data.workspace).toBeUndefined()
    expect(version.status).toBe(200)
    expect(version.headers.get('Cache-Control')).toBe('no-store')
    expect((await version.json()).data.workspace).toBeUndefined()
    expect(prefixed.status).toBe(404)
    expect(await prefixed.json()).toMatchObject({ success: false, error: { code: 'UNSUPPORTED_SITE' } })
  })

  it('does not exempt POST health or version routes', async () => {
    const health = await request('https://unknown.workers.dev/api/health', { method: 'POST' })
    const version = await request('https://unknown.workers.dev/api/version', { method: 'POST' })

    expect(health.status).toBe(404)
    expect(version.status).toBe(404)
    expect(await health.json()).toMatchObject({ success: false, error: { code: 'UNSUPPORTED_SITE' } })
    expect(await version.json()).toMatchObject({ success: false, error: { code: 'UNSUPPORTED_SITE' } })
  })
})
