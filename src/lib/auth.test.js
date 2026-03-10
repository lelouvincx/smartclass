import {
  AUTH_TOKEN_KEY,
  clearStoredToken,
  getStoredToken,
  setStoredToken,
} from './auth'

describe('auth token storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stores and reads token from localStorage', () => {
    setStoredToken('token-123')
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe('token-123')
    expect(getStoredToken()).toBe('token-123')
  })

  it('removes token from localStorage', () => {
    localStorage.setItem(AUTH_TOKEN_KEY, 'token-123')
    clearStoredToken()
    expect(getStoredToken()).toBeNull()
  })
})
