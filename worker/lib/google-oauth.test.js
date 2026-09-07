import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { _resetJwksCache, exchangeCode, getGoogleJwks, verifyGoogleIdToken } from './google-oauth.js'
import { makeIdToken, mockGoogleFetch, tamperSignature } from '../test/google-oauth-helpers.js'

const env = {
  GOOGLE_CLIENT_ID: 'test-google-client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
}

beforeEach(() => {
  _resetJwksCache()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('verifyGoogleIdToken', () => {
  it('accepts a well-formed, signed id_token', async () => {
    const { idToken, publicJwk } = await makeIdToken()
    mockGoogleFetch({ jwks: { keys: [publicJwk] } })

    const claims = await verifyGoogleIdToken(env, idToken)
    expect(claims.sub).toBe('1234567890')
    expect(claims.email).toBe('test@gmail.com')
  })

  it('rejects malformed id_token', async () => {
    mockGoogleFetch({ jwks: { keys: [] } })
    await expect(verifyGoogleIdToken(env, 'not-a-jwt')).rejects.toMatchObject({
      code: 'INVALID_ID_TOKEN',
    })
  })

  it('rejects unsupported alg', async () => {
    const { idToken, publicJwk } = await makeIdToken({ header: { alg: 'HS256' } })
    mockGoogleFetch({ jwks: { keys: [publicJwk] } })
    await expect(verifyGoogleIdToken(env, idToken)).rejects.toMatchObject({
      code: 'INVALID_ID_TOKEN',
    })
  })

  it('rejects bad issuer', async () => {
    const { idToken, publicJwk } = await makeIdToken({ payload: { iss: 'https://evil.example' } })
    mockGoogleFetch({ jwks: { keys: [publicJwk] } })
    await expect(verifyGoogleIdToken(env, idToken)).rejects.toMatchObject({
      code: 'INVALID_ID_TOKEN',
    })
  })

  it('rejects bad audience', async () => {
    const { idToken, publicJwk } = await makeIdToken({ payload: { aud: 'someone-else' } })
    mockGoogleFetch({ jwks: { keys: [publicJwk] } })
    await expect(verifyGoogleIdToken(env, idToken)).rejects.toMatchObject({
      code: 'INVALID_ID_TOKEN',
    })
  })

  it('rejects expired id_token', async () => {
    const past = Math.floor(Date.now() / 1000) - 7200
    const { idToken, publicJwk } = await makeIdToken({ payload: { iat: past, exp: past + 100 } })
    mockGoogleFetch({ jwks: { keys: [publicJwk] } })
    await expect(verifyGoogleIdToken(env, idToken)).rejects.toMatchObject({
      code: 'INVALID_ID_TOKEN',
    })
  })

  it('rejects unverified email', async () => {
    const { idToken, publicJwk } = await makeIdToken({ payload: { email_verified: false } })
    mockGoogleFetch({ jwks: { keys: [publicJwk] } })
    await expect(verifyGoogleIdToken(env, idToken)).rejects.toMatchObject({
      code: 'EMAIL_NOT_VERIFIED',
    })
  })

  it('rejects bad nonce when expectedNonce provided', async () => {
    const { idToken, publicJwk } = await makeIdToken({ payload: { nonce: 'real-nonce' } })
    mockGoogleFetch({ jwks: { keys: [publicJwk] } })
    await expect(
      verifyGoogleIdToken(env, idToken, { expectedNonce: 'different-nonce' }),
    ).rejects.toMatchObject({ code: 'INVALID_ID_TOKEN' })
  })

  it('accepts matching nonce', async () => {
    const { idToken, publicJwk } = await makeIdToken({ payload: { nonce: 'good-nonce' } })
    mockGoogleFetch({ jwks: { keys: [publicJwk] } })
    const claims = await verifyGoogleIdToken(env, idToken, { expectedNonce: 'good-nonce' })
    expect(claims.nonce).toBe('good-nonce')
  })

  it('rejects tampered signature', async () => {
    const { idToken, publicJwk } = await makeIdToken()
    mockGoogleFetch({ jwks: { keys: [publicJwk] } })
    const bad = tamperSignature(idToken)
    await expect(verifyGoogleIdToken(env, bad)).rejects.toMatchObject({
      code: 'INVALID_ID_TOKEN',
    })
  })

  it('rejects when no JWK matches kid', async () => {
    const { idToken } = await makeIdToken({ kid: 'unknown-kid' })
    mockGoogleFetch({ jwks: { keys: [] } })
    await expect(verifyGoogleIdToken(env, idToken)).rejects.toMatchObject({
      code: 'INVALID_ID_TOKEN',
    })
  })
})

describe('getGoogleJwks', () => {
  it('caches keys across calls', async () => {
    const { publicJwk } = await makeIdToken()
    const spy = mockGoogleFetch({ jwks: { keys: [publicJwk] } })

    await getGoogleJwks()
    await getGoogleJwks()
    await getGoogleJwks()

    const jwksCalls = spy.mock.calls.filter((c) => String(c[0]).includes('certs'))
    expect(jwksCalls).toHaveLength(1)
  })

  it('falls back to cached keys if refetch fails', async () => {
    const { publicJwk } = await makeIdToken()
    mockGoogleFetch({ jwks: { keys: [publicJwk] } })
    const initial = await getGoogleJwks()
    expect(initial).toHaveLength(1)

    // Simulate failure
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new Error('network down')
    })

    const fallback = await getGoogleJwks({ force: true })
    expect(fallback).toEqual(initial)
  })
})

describe('exchangeCode', () => {
  it('returns parsed token response on success', async () => {
    mockGoogleFetch({
      tokenResponse: { status: 200, body: { id_token: 'fake', access_token: 'a' } },
      jwks: { keys: [] },
    })
    const tokens = await exchangeCode(env, {
      code: 'abc',
      codeVerifier: 'verifier',
      redirectUri: 'http://localhost:5173/auth/google/callback',
    })
    expect(tokens.id_token).toBe('fake')
  })

  it('throws INVALID_GOOGLE_CODE on 400', async () => {
    mockGoogleFetch({
      tokenResponse: { status: 400, body: { error: 'invalid_grant' } },
      jwks: { keys: [] },
    })
    await expect(
      exchangeCode(env, { code: 'bad', codeVerifier: 'v', redirectUri: 'r' }),
    ).rejects.toMatchObject({ code: 'INVALID_GOOGLE_CODE' })
  })

  it('throws GOOGLE_UNAVAILABLE on 5xx', async () => {
    mockGoogleFetch({
      tokenResponse: { status: 503, body: { error: 'temporarily_unavailable' } },
      jwks: { keys: [] },
    })
    await expect(
      exchangeCode(env, { code: 'x', codeVerifier: 'v', redirectUri: 'r' }),
    ).rejects.toMatchObject({ code: 'GOOGLE_UNAVAILABLE' })
  })
})
