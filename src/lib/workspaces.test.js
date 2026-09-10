import { getWorkspaceSiteForOrigin, isAllowedTeacherDestination, requireWorkspaceSite } from './workspaces'

describe('frontend workspace map', () => {
  it('uses the same explicit test host map as the worker', () => {
    expect(getWorkspaceSiteForOrigin('http://maths.test', { APP_ENV: 'test' })).toMatchObject({
      id: 'maths',
      api_origin: 'http://maths-api.test',
      google_redirect_uri: 'http://maths.test/auth/google/callback',
    })
    expect(getWorkspaceSiteForOrigin('http://english.test', { APP_ENV: 'test' })).toMatchObject({
      id: 'english',
      api_origin: 'http://english-api.test',
      google_redirect_uri: 'http://english.test/auth/google/callback',
    })
  })

  it('rejects unknown hosts instead of using arbitrary overrides or calculated hostnames', () => {
    expect(() => requireWorkspaceSite('http://localhost:3000', { APP_ENV: 'development' })).toThrow(
      'SmartClass is not configured for this website.',
    )
    expect(getWorkspaceSiteForOrigin('http://localhost:3000', { APP_ENV: 'test' })).toBeNull()
    expect(getWorkspaceSiteForOrigin('https://preview.pages.dev', { PROD: true })).toBeNull()
    expect(getWorkspaceSiteForOrigin('https://toanthaythanh.com', { APP_ENV: 'unknown' })).toBeNull()
  })

  it('maps both local sites and production without accepting VITE API overrides', () => {
    for (const [origin, api] of [
      ['http://localhost:5173', 'http://localhost:8787'],
      ['http://localhost:5174', 'http://localhost:8788'],
    ]) {
      expect(requireWorkspaceSite(origin, { APP_ENV: 'development', VITE_API_URL: 'https://evil.test' }).api_origin).toBe(api)
    }
    expect(requireWorkspaceSite('https://tienganhcothuy.com', { PROD: true }).api_origin).toBe('https://api.tienganhcothuy.com')
  })

  it('allows teacher redirects only to configured server destinations', () => {
    expect(isAllowedTeacherDestination({ workspace_id: 'english', url: 'http://english.test' }, { APP_ENV: 'test' })).toBe(true)
    expect(isAllowedTeacherDestination({ workspace_id: 'english', url: 'http://evil.test' }, { APP_ENV: 'test' })).toBe(false)
    for (const url of ['http://english.test?token=secret', 'http://english.test/#code=secret', 'http://user:pass@english.test', '//english.test']) {
      expect(isAllowedTeacherDestination({ workspace_id: 'english', url }, { APP_ENV: 'test' })).toBe(false)
    }
  })
})
