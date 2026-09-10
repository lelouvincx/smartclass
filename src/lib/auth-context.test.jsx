import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, deriveAuthState, useAuth } from './auth-context'
import { setSubmissionPointer } from './submission-draft'
import { getMe, login } from './api'

const clearStoredTokenMock = vi.fn()
const storedToken = vi.hoisted(() => ({ value: null }))

vi.mock('./api', () => ({
  getMe: vi.fn(),
  login: vi.fn(),
}))

vi.mock('./auth', () => ({
  getStoredToken: () => storedToken.value,
  setStoredToken: vi.fn(),
  clearStoredToken: () => clearStoredTokenMock(),
}))

function LogoutButton() {
  const { logout } = useAuth()
  return <button onClick={logout}>Log out</button>
}

function AccountProbe() {
  const auth = useAuth()
  return <>
    <output data-testid="account">{JSON.stringify(auth)}</output>
    <button onClick={() => auth.login({ phone: '+84900000001', password: '123' })}>Sign in</button>
    <button onClick={auth.logout}>Log out</button>
  </>
}

afterEach(() => { storedToken.value = null })

describe('AuthProvider logout', () => {
  beforeEach(() => {
    sessionStorage.clear()
    clearStoredTokenMock.mockReset()
  })

  it('clears all same-session submission pointers and drafts', async () => {
    setSubmissionPointer(7, 1, 10)
    sessionStorage.setItem('smartclass-submission-v1:draft:7:10', '{}')
    render(<AuthProvider><LogoutButton /></AuthProvider>)

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))

    expect(clearStoredTokenMock).toHaveBeenCalled()
    const remainingDraftKeys = [...Array(sessionStorage.length)]
      .map((_, index) => sessionStorage.key(index))
      .filter((key) => key.startsWith('smartclass-submission-v1:'))
    expect(remainingDraftKeys).toHaveLength(0)
  })
})

describe('AuthProvider workspace envelope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const envelope = {
    user: { id: 7, name: 'Mai', platform_role: 'user', disabled_at: null },
    workspace: { id: 'english' }, membership: null,
    teacher_routing: { action: 'redirect', destinations: [{ workspace_id: 'maths', url: 'http://maths.test' }] },
  }

  it('restores identity without membership and preserves the canonical teacher routing decision', async () => {
    storedToken.value = 'english-token'
    vi.mocked(getMe).mockResolvedValue({ data: envelope })
    render(<AuthProvider><AccountProbe /></AuthProvider>)
    await waitFor(() => expect(JSON.parse(screen.getByTestId('account').textContent).isLoading).toBe(false))
    expect(getMe).toHaveBeenCalledWith('english-token')
    expect(JSON.parse(screen.getByTestId('account').textContent)).toMatchObject({
      user: envelope.user, membership: null, workspace: { id: 'english' },
      teacherRouting: envelope.teacher_routing, canManage: false, defaultPath: '/join', isAuthenticated: true,
    })
  })

  it('clears a rejected workspace or legacy session', async () => {
    storedToken.value = 'legacy-token'
    vi.mocked(getMe).mockRejectedValue(new Error('Unauthorized'))
    render(<AuthProvider><AccountProbe /></AuthProvider>)
    await waitFor(() => expect(JSON.parse(screen.getByTestId('account').textContent).isLoading).toBe(false))
    expect(clearStoredTokenMock).toHaveBeenCalled()
    expect(JSON.parse(screen.getByTestId('account').textContent)).toMatchObject({ token: null, user: null, membership: null })
  })

  it('does not let an in-flight restoration resurrect an account after logout', async () => {
    storedToken.value = 'english-token'
    let resolve
    vi.mocked(getMe).mockReturnValue(new Promise((done) => { resolve = done }))
    render(<AuthProvider><AccountProbe /></AuthProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    await act(async () => resolve({ data: envelope }))
    expect(JSON.parse(screen.getByTestId('account').textContent)).toMatchObject({ user: null, token: null })
  })

  it('applies the phone-login envelope without merging membership into the user', async () => {
    vi.mocked(login).mockResolvedValue({ data: { ...envelope, token: 'english-token' } })
    vi.mocked(getMe).mockResolvedValue({ data: envelope })
    render(<AuthProvider><AccountProbe /></AuthProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(JSON.parse(screen.getByTestId('account').textContent)).toMatchObject({
      user: envelope.user, membership: null, teacherRouting: envelope.teacher_routing,
    })
  })

  it('keeps shared identity, workspace membership, and derived permissions separate', async () => {
    const state = deriveAuthState({
      token: 'token',
      user: { id: 7, name: 'Mai', phone: '+84900000001', platform_role: 'user', disabled_at: null },
      workspace: { id: 'maths', frontend_origin: 'http://maths.test', api_origin: 'http://maths-api.test' },
      membership: { id: 2, role: 'student', status: 'active', access_tier: 'vip', grades: [10] },
      teacher_routing: { action: 'stay' },
      isLoading: false,
    })

    expect(state.user).toMatchObject({ id: 7, platform_role: 'user' })
    expect(state.membership).toMatchObject({ role: 'student', status: 'active', access_tier: 'vip' })
    expect(state.workspace).toMatchObject({ id: 'maths' })
    expect(state.isActiveStudent).toBe(true)
    expect(state.canManage).toBe(false)
    expect(state.defaultPath).toBe('/student')
  })

  it('does not fall back to legacy user.role when membership is absent', async () => {
    const state = deriveAuthState({
      token: 'token',
      user: { id: 8, name: 'Legacy', role: 'teacher', platform_role: 'user', disabled_at: null },
      workspace: { id: 'maths' },
      membership: null,
      teacher_routing: { action: 'stay' },
      isLoading: false,
    })

    expect(state.canManage).toBe(false)
    expect(state.isActiveStudent).toBe(false)
    expect(state.defaultPath).toBe('/join')
  })
})
