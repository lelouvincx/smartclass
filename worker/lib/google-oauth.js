// Google OIDC: token exchange + id_token verification (JWKS, RS256).
// RFC-7. No SDK — Workers + Web Crypto only.

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const GOOGLE_VALID_ISS = new Set(['accounts.google.com', 'https://accounts.google.com'])
const CLOCK_SKEW_SECONDS = 60
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

let jwksCache = null // { keys, fetchedAt }

/** Reset the module-level JWKS cache. Test-only helper. */
export function _resetJwksCache() {
  jwksCache = null
}

function base64UrlToBytes(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '=')
  const bin = atob(padded)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function base64UrlToString(str) {
  return new TextDecoder().decode(base64UrlToBytes(str))
}

function googleError(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

/**
 * Fetch Google's JWKS, with module-level caching + stale fallback.
 */
export async function getGoogleJwks({ now = Date.now(), force = false } = {}) {
  if (!force && jwksCache && now - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return jwksCache.keys
  }
  let res
  try {
    res = await fetch(GOOGLE_JWKS_URL)
  } catch (e) {
    if (jwksCache) return jwksCache.keys
    throw googleError('GOOGLE_UNAVAILABLE', `JWKS fetch failed: ${e.message}`)
  }
  if (!res.ok) {
    if (jwksCache) return jwksCache.keys
    throw googleError('GOOGLE_UNAVAILABLE', `JWKS HTTP ${res.status}`)
  }
  const body = await res.json()
  jwksCache = { keys: body.keys || [], fetchedAt: now }
  return jwksCache.keys
}

/**
 * Exchange an authorization code for tokens at Google's token endpoint.
 * Returns the raw response body (contains `id_token`, `access_token`, etc.).
 */
export async function exchangeCode(env, { code, codeVerifier, redirectUri }) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
  })

  let res
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
  } catch (e) {
    throw googleError('GOOGLE_UNAVAILABLE', `Token endpoint unreachable: ${e.message}`)
  }

  if (res.status >= 500) {
    throw googleError('GOOGLE_UNAVAILABLE', `Token endpoint HTTP ${res.status}`)
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw googleError('INVALID_GOOGLE_CODE', `Token exchange rejected: ${res.status} ${errBody}`)
  }

  return res.json()
}

/**
 * Verify a Google id_token. Returns parsed claims on success, throws with `.code`
 * one of: INVALID_ID_TOKEN | EMAIL_NOT_VERIFIED | GOOGLE_UNAVAILABLE.
 *
 * Checks: alg=RS256, iss, aud, exp+iat (with skew), nonce (if expected), email_verified, signature.
 */
export async function verifyGoogleIdToken(env, idToken, { expectedNonce, now = Math.floor(Date.now() / 1000) } = {}) {
  if (!idToken || typeof idToken !== 'string') {
    throw googleError('INVALID_ID_TOKEN', 'id_token missing')
  }
  const parts = idToken.split('.')
  if (parts.length !== 3) {
    throw googleError('INVALID_ID_TOKEN', 'id_token malformed')
  }

  const [headerB64, payloadB64, sigB64] = parts
  let header, payload
  try {
    header = JSON.parse(base64UrlToString(headerB64))
    payload = JSON.parse(base64UrlToString(payloadB64))
  } catch {
    throw googleError('INVALID_ID_TOKEN', 'id_token JSON parse failed')
  }

  if (header.alg !== 'RS256') {
    throw googleError('INVALID_ID_TOKEN', `unsupported alg: ${header.alg}`)
  }

  // Claim checks
  if (!GOOGLE_VALID_ISS.has(payload.iss)) {
    throw googleError('INVALID_ID_TOKEN', `bad iss: ${payload.iss}`)
  }
  if (payload.aud !== env.GOOGLE_CLIENT_ID) {
    throw googleError('INVALID_ID_TOKEN', `bad aud: ${payload.aud}`)
  }
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_SECONDS < now) {
    throw googleError('INVALID_ID_TOKEN', 'id_token expired')
  }
  if (typeof payload.iat !== 'number' || payload.iat - CLOCK_SKEW_SECONDS > now) {
    throw googleError('INVALID_ID_TOKEN', 'id_token iat in the future')
  }
  if (expectedNonce !== undefined && expectedNonce !== null && payload.nonce !== expectedNonce) {
    throw googleError('INVALID_ID_TOKEN', 'nonce mismatch')
  }
  if (payload.email_verified !== true) {
    throw googleError('EMAIL_NOT_VERIFIED', 'Google reports email not verified')
  }

  // Signature: pick JWK by kid, verify via Web Crypto
  let keys = await getGoogleJwks()
  let jwk = keys.find((k) => k.kid === header.kid)
  if (!jwk) {
    keys = await getGoogleJwks({ force: true })
    jwk = keys.find((k) => k.kid === header.kid)
  }
  if (!jwk) {
    throw googleError('INVALID_ID_TOKEN', `no matching JWK for kid=${header.kid}`)
  }

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  const sig = base64UrlToBytes(sigB64)
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, sig, data)
  if (!ok) {
    throw googleError('INVALID_ID_TOKEN', 'signature verify failed')
  }

  return payload
}

export const _internal = {
  GOOGLE_TOKEN_URL,
  GOOGLE_JWKS_URL,
  GOOGLE_VALID_ISS,
  CLOCK_SKEW_SECONDS,
  JWKS_CACHE_TTL_MS,
}
