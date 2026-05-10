import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from 'cloudflare:test'
import app from '../index.js'
import { _resetJwksCache } from '../lib/google-oauth.js'
import { makeIdToken, mockGoogleFetch, tamperSignature } from '../test/google-oauth-helpers.js'
import { loginAsStudent, seedStudent, seedTeacher } from '../test/helpers.js'

const VALID_BODY = {
  code: 'auth-code-from-google',
  code_verifier: 'pkce-verifier',
  redirect_uri: 'http://localhost:5173/auth/google/callback',
}

async function setupGoogleMock(payloadOverrides = {}) {
  const { idToken, publicJwk } = await makeIdToken({
    payload: { sub: 'google-sub-123', email: 'student@gmail.com', ...payloadOverrides },
  })
  mockGoogleFetch({
    tokenResponse: { status: 200, body: { id_token: idToken, access_token: 'a' } },
    jwks: { keys: [publicJwk] },
  })
  return { idToken, publicJwk }
}

beforeEach(() => {
  _resetJwksCache()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/auth/google/login', () => {
  it('400 when required fields missing', async () => {
    const res = await app.request(
      '/api/auth/google/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'x' }),
      },
      env,
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('400 when Google rejects the auth code', async () => {
    mockGoogleFetch({
      tokenResponse: { status: 400, body: { error: 'invalid_grant' } },
      jwks: { keys: [] },
    })
    const res = await app.request(
      '/api/auth/google/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(VALID_BODY),
      },
      env,
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('INVALID_GOOGLE_CODE')
  })

  it('502 when Google token endpoint is down', async () => {
    mockGoogleFetch({
      tokenResponse: { status: 503, body: {} },
      jwks: { keys: [] },
    })
    const res = await app.request(
      '/api/auth/google/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(VALID_BODY),
      },
      env,
    )
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error.code).toBe('GOOGLE_UNAVAILABLE')
  })

  it('401 when id_token signature is tampered', async () => {
    const { idToken, publicJwk } = await makeIdToken()
    const tampered = tamperSignature(idToken)
    mockGoogleFetch({
      tokenResponse: { status: 200, body: { id_token: tampered } },
      jwks: { keys: [publicJwk] },
    })
    const res = await app.request(
      '/api/auth/google/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(VALID_BODY),
      },
      env,
    )
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('INVALID_ID_TOKEN')
  })

  it('401 when email is not verified', async () => {
    await setupGoogleMock({ email_verified: false })
    const res = await app.request(
      '/api/auth/google/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(VALID_BODY),
      },
      env,
    )
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('EMAIL_NOT_VERIFIED')
  })

  it('404 NO_LINKED_ACCOUNT when no user has matching google_sub', async () => {
    await setupGoogleMock({ sub: 'unknown-sub' })
    const res = await app.request(
      '/api/auth/google/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(VALID_BODY),
      },
      env,
    )
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('NO_LINKED_ACCOUNT')
  })

  it('200 + JWT when google_sub matches an active user', async () => {
    await seedStudent('+84900000001')
    await env.DB.prepare(
      `UPDATE users SET google_sub = 'google-sub-123', google_email = 'old@gmail.com' WHERE phone = '+84900000001'`,
    ).run()

    await setupGoogleMock({ sub: 'google-sub-123', email: 'student@gmail.com' })

    const res = await app.request(
      '/api/auth/google/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(VALID_BODY),
      },
      env,
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.token).toBeTruthy()
    expect(body.data.user.phone).toBe('+84900000001')
    expect(body.data.user.role).toBe('student')

    // google_email refreshed
    const row = await env.DB.prepare(`SELECT google_email FROM users WHERE phone = '+84900000001'`).first()
    expect(row.google_email).toBe('student@gmail.com')
  })

  it('403 ACCOUNT_PENDING when matched user is pending', async () => {
    await env.DB.prepare(
      `INSERT INTO users (phone, password_hash, role, status, google_sub) VALUES ('+84900000002', 'hash', 'student', 'pending', 'google-sub-pending')`,
    ).run()

    await setupGoogleMock({ sub: 'google-sub-pending' })

    const res = await app.request(
      '/api/auth/google/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(VALID_BODY),
      },
      env,
    )
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('ACCOUNT_PENDING')
  })

  it('403 ACCOUNT_DISABLED when matched user is disabled', async () => {
    await env.DB.prepare(
      `INSERT INTO users (phone, password_hash, role, status, google_sub) VALUES ('+84900000003', 'hash', 'student', 'disabled', 'google-sub-disabled')`,
    ).run()

    await setupGoogleMock({ sub: 'google-sub-disabled' })

    const res = await app.request(
      '/api/auth/google/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(VALID_BODY),
      },
      env,
    )
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('ACCOUNT_DISABLED')
  })
})

describe('POST /api/auth/google/link', () => {
  it('401 when caller is not authenticated', async () => {
    await setupGoogleMock()
    const res = await app.request(
      '/api/auth/google/link',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(VALID_BODY),
      },
      env,
    )
    expect(res.status).toBe(401)
  })

  it('200 attaches google_sub + google_email to the authed user', async () => {
    await seedStudent('+84900000010')
    const token = await loginAsStudent('+84900000010')

    await setupGoogleMock({ sub: 'fresh-sub-1', email: 'fresh@gmail.com' })

    const res = await app.request(
      '/api/auth/google/link',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(VALID_BODY),
      },
      env,
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.google_email).toBe('fresh@gmail.com')

    const row = await env.DB.prepare(
      `SELECT google_sub, google_email FROM users WHERE phone = '+84900000010'`,
    ).first()
    expect(row.google_sub).toBe('fresh-sub-1')
    expect(row.google_email).toBe('fresh@gmail.com')
  })

  it('409 GOOGLE_SUB_TAKEN when sub is on another user', async () => {
    await seedStudent('+84900000020')
    await env.DB.prepare(
      `UPDATE users SET google_sub = 'taken-sub' WHERE phone = '+84900000020'`,
    ).run()

    await seedStudent('+84900000021')
    const token = await loginAsStudent('+84900000021')

    await setupGoogleMock({ sub: 'taken-sub' })

    const res = await app.request(
      '/api/auth/google/link',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(VALID_BODY),
      },
      env,
    )
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('GOOGLE_SUB_TAKEN')
  })

  it('200 replaces an existing link on the same user (last-write-wins)', async () => {
    await seedStudent('+84900000030')
    await env.DB.prepare(
      `UPDATE users SET google_sub = 'old-sub', google_email = 'old@gmail.com' WHERE phone = '+84900000030'`,
    ).run()
    const token = await loginAsStudent('+84900000030')

    await setupGoogleMock({ sub: 'new-sub', email: 'new@gmail.com' })

    const res = await app.request(
      '/api/auth/google/link',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(VALID_BODY),
      },
      env,
    )
    expect(res.status).toBe(200)

    const row = await env.DB.prepare(
      `SELECT google_sub, google_email FROM users WHERE phone = '+84900000030'`,
    ).first()
    expect(row.google_sub).toBe('new-sub')
    expect(row.google_email).toBe('new@gmail.com')
  })
})

describe('DELETE /api/auth/google/link', () => {
  it('401 when caller is not authenticated', async () => {
    const res = await app.request('/api/auth/google/link', { method: 'DELETE' }, env)
    expect(res.status).toBe(401)
  })

  it('200 clears google_sub and google_email', async () => {
    await seedStudent('+84900000040')
    await env.DB.prepare(
      `UPDATE users SET google_sub = 'will-clear', google_email = 'g@gmail.com' WHERE phone = '+84900000040'`,
    ).run()
    const token = await loginAsStudent('+84900000040')

    const res = await app.request(
      '/api/auth/google/link',
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      env,
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.google_email).toBeNull()

    const row = await env.DB.prepare(
      `SELECT google_sub, google_email FROM users WHERE phone = '+84900000040'`,
    ).first()
    expect(row.google_sub).toBeNull()
    expect(row.google_email).toBeNull()
  })
})

describe('GET /api/auth/me extended fields', () => {
  it('returns email and google_email after linking', async () => {
    await seedTeacher()
    const loginRes = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+84865481769', password: '123' }),
      },
      env,
    )
    const teacherToken = (await loginRes.json()).data.token

    await env.DB.prepare(
      `UPDATE users SET google_email = 'teacher@gmail.com', google_sub = 'teacher-sub' WHERE phone = '+84865481769'`,
    ).run()

    const res = await app.request(
      '/api/auth/me',
      { headers: { Authorization: `Bearer ${teacherToken}` } },
      env,
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.google_email).toBe('teacher@gmail.com')
    expect(body.data).toHaveProperty('email')
  })
})
