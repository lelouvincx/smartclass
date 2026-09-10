import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import GoogleCallbackPage from './GoogleCallbackPage'
import { _STORAGE_KEYS } from '@/lib/google-oauth'

const mocks = vi.hoisted(() => ({ login: vi.fn(), link: vi.fn(), apply: vi.fn(), navigate: vi.fn(), auth: {} }))
vi.mock('@/lib/api', () => ({ loginWithGoogle: mocks.login, linkGoogle: mocks.link }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => mocks.auth }))
vi.mock('react-router-dom', async (original) => ({ ...await original(), useNavigate: () => mocks.navigate }))

describe('Google callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    mocks.auth = { token: null, isLoading: false, loginWithGoogleResponse: mocks.apply, defaultPath: '/' }
    for (const [key, value] of Object.entries({ state: 'state', nonce: 'nonce', verifier: 'verifier', mode: 'login' })) {
      sessionStorage.setItem(_STORAGE_KEYS[key], value)
    }
  })
  const show = (query) => render(<MemoryRouter initialEntries={[`/auth/google/callback${query}`]}><GoogleCallbackPage /></MemoryRouter>)

  it('finishes cancellation and clears OAuth state rather than hanging', async () => {
    show('?error=access_denied')
    expect(await screen.findByText('Sign-in cancelled')).toBeInTheDocument()
    expect(sessionStorage.getItem(_STORAGE_KEYS.state)).toBeNull()
    expect(mocks.login).not.toHaveBeenCalled()
  })

  it('finishes a missing-code callback with an actionable error', async () => {
    show('')
    expect(await screen.findByRole('alert')).toHaveTextContent('No authorization code')
    expect(mocks.login).not.toHaveBeenCalled()
  })

  it('sends the nonce and configured callback in link mode', async () => {
    mocks.auth.token = 'maths-token'
    sessionStorage.setItem(_STORAGE_KEYS.mode, 'link')
    mocks.link.mockResolvedValue({ data: {} })
    show('?code=one-use-code&state=state')
    await waitFor(() => expect(mocks.link).toHaveBeenCalledWith('maths-token', {
      code: 'one-use-code', code_verifier: 'verifier', expected_nonce: 'nonce',
      redirect_uri: 'http://maths.test/auth/google/callback',
    }))
    expect(mocks.navigate).toHaveBeenCalledWith('/settings', { replace: true })
  })

  it('applies the full login envelope and leaves cross-site navigation to the routing gate', async () => {
    window.history.replaceState(null, '', '/auth/google/callback?code=one-use-code&state=state')
    const data = {
      token: 'token', user: { id: 8, platform_role: 'user', disabled_at: null }, membership: null,
      workspace: { id: 'maths' }, teacher_routing: { action: 'redirect', destinations: [{ workspace_id: 'english', url: 'http://english.test' }] },
    }
    mocks.login.mockResolvedValue({ data })
    show('?code=one-use-code&state=state')
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledWith(data))
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')
  })

  it('rejects a missing nonce before sending the code', async () => {
    sessionStorage.removeItem(_STORAGE_KEYS.nonce)
    show('?code=one-use-code&state=state')
    expect(await screen.findByRole('alert')).toHaveTextContent(/State mismatch/)
    expect(mocks.login).not.toHaveBeenCalled()
  })
})
