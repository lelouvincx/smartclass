import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './auth-context'
import { setSubmissionPointer } from './submission-draft'

const clearStoredTokenMock = vi.fn()

vi.mock('./api', () => ({
  getMe: vi.fn(),
  login: vi.fn(),
  loginWithGoogle: vi.fn(),
}))

vi.mock('./auth', () => ({
  getStoredToken: () => null,
  setStoredToken: vi.fn(),
  clearStoredToken: () => clearStoredTokenMock(),
}))

function LogoutButton() {
  const { logout } = useAuth()
  return <button onClick={logout}>Log out</button>
}

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
