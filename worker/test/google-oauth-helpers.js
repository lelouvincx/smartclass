// Test utilities: generate signed Google id_tokens + mock fetch for token + JWKS endpoints.
// Used by RFC-7 (Google OAuth) tests.

import { vi } from 'vitest'

function bytesToB64Url(bytes) {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function strToB64Url(s) {
  return bytesToB64Url(new TextEncoder().encode(s))
}

/**
 * Generate an RSA key pair + signed id_token + matching JWK.
 * Caller can override claims via `payload`. `kid` ties the JWT header to the JWK.
 */
export async function makeIdToken({
  payload = {},
  header = {},
  kid = 'test-kid-1',
  audience = 'test-google-client-id.apps.googleusercontent.com',
} = {}) {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )

  const now = Math.floor(Date.now() / 1000)
  const fullHeader = { alg: 'RS256', typ: 'JWT', kid, ...header }
  const fullPayload = {
    iss: 'https://accounts.google.com',
    aud: audience,
    sub: '1234567890',
    email: 'test@gmail.com',
    email_verified: true,
    iat: now,
    exp: now + 3600,
    ...payload,
  }

  const headerB64 = strToB64Url(JSON.stringify(fullHeader))
  const payloadB64 = strToB64Url(JSON.stringify(fullPayload))
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, data)
  const sigB64 = bytesToB64Url(new Uint8Array(sig))

  const idToken = `${headerB64}.${payloadB64}.${sigB64}`
  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)

  return {
    idToken,
    publicJwk: { ...publicJwk, kid, use: 'sig', alg: 'RS256' },
    kid,
    payload: fullPayload,
  }
}

/**
 * Mutate a JWT to invalidate its signature (flip a bit in sig segment).
 */
export function tamperSignature(idToken) {
  const parts = idToken.split('.')
  const sig = parts[2]
  const flipped = sig[0] === 'A' ? 'B' + sig.slice(1) : 'A' + sig.slice(1)
  return `${parts[0]}.${parts[1]}.${flipped}`
}

/**
 * Mock global fetch for Google's token + JWKS endpoints. Other URLs throw
 * (so unmocked external calls in a test fail loudly).
 *
 * `tokenResponse` shape: { status?: number, body: object }
 * `jwks` shape: { keys: [...] }
 */
export function mockGoogleFetch({ tokenResponse, jwks }) {
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = String(url)
    if (u.includes('oauth2.googleapis.com/token')) {
      const status = tokenResponse?.status ?? 200
      const body = tokenResponse?.body ?? {}
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (u.includes('googleapis.com/oauth2/v3/certs')) {
      return new Response(JSON.stringify(jwks ?? { keys: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    throw new Error(`Unexpected fetch in test: ${u}`)
  })
  return spy
}
