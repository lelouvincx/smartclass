// Google OIDC PKCE + URL builder for SPA (RFC-7).
// All state in sessionStorage — no server round-trip needed to initiate login.

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_SCOPES = 'openid email profile'

const STORAGE_KEYS = {
  state: 'google_oauth_state',
  nonce: 'google_oauth_nonce',
  verifier: 'google_oauth_code_verifier',
  mode: 'google_oauth_mode',
  returnTo: 'google_oauth_return_to',
}

export function getGoogleClientId() {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID || '682922438707-47s4d9f7s7j17k13kn4b4p3ttmd4lsq1.apps.googleusercontent.com'
}

export function getGoogleRedirectUri() {
  const origin = window.location.origin
  return `${origin}/auth/google/callback`
}

function base64UrlEncode(bytes) {
  const bin = String.fromCharCode(...new Uint8Array(bytes))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomBytes(len) {
  return crypto.getRandomValues(new Uint8Array(len))
}

function randomString(byteLen = 32) {
  return base64UrlEncode(randomBytes(byteLen))
}

export async function generatePkcePair() {
  const verifier = randomString(64)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const challenge = base64UrlEncode(new Uint8Array(digest))
  return { verifier, challenge }
}

export function buildAuthUrl({ clientId, redirectUri, state, nonce, codeChallenge }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

export async function startGoogleFlow({ mode = 'login', returnTo = '/' } = {}) {
  const clientId = getGoogleClientId()
  const redirectUri = getGoogleRedirectUri()
  const state = randomString(32)
  const nonce = randomString(32)
  const { verifier, challenge } = await generatePkcePair()

  sessionStorage.setItem(STORAGE_KEYS.state, state)
  sessionStorage.setItem(STORAGE_KEYS.nonce, nonce)
  sessionStorage.setItem(STORAGE_KEYS.verifier, verifier)
  sessionStorage.setItem(STORAGE_KEYS.mode, mode)
  sessionStorage.setItem(STORAGE_KEYS.returnTo, returnTo)

  const url = buildAuthUrl({ clientId, redirectUri, state, nonce, codeChallenge: challenge })
  window.location.assign(url)
}

export function consumeStoredParams() {
  const state = sessionStorage.getItem(STORAGE_KEYS.state)
  const nonce = sessionStorage.getItem(STORAGE_KEYS.nonce)
  const verifier = sessionStorage.getItem(STORAGE_KEYS.verifier)
  const mode = sessionStorage.getItem(STORAGE_KEYS.mode) || 'login'
  const returnTo = sessionStorage.getItem(STORAGE_KEYS.returnTo) || '/'

  Object.values(STORAGE_KEYS).forEach((k) => sessionStorage.removeItem(k))

  return { state, nonce, verifier, mode, returnTo }
}

export const _STORAGE_KEYS = STORAGE_KEYS
