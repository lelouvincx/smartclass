export const AUTH_TOKEN_KEY = 'smartclass_token'

export function getStoredToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY)
}

export function setStoredToken(token) {
  localStorage.setItem(AUTH_TOKEN_KEY, token)
}

export function clearStoredToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY)
}
