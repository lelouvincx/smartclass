import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import WorkspaceStatusPage from './WorkspaceStatusPage'

const mocks = vi.hoisted(() => ({ auth: {}, join: vi.fn() }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => mocks.auth }))
vi.mock('@/lib/api', () => ({ joinWorkspace: (...args) => mocks.join(...args) }))

describe('workspace access status', () => {
  beforeEach(() => {
    mocks.join.mockReset().mockResolvedValue({ data: {} })
    mocks.auth = {
      token: 'english-token', user: { id: 7, platform_role: 'user', disabled_at: null },
      workspace: { id: 'english' }, membership: null, isLoading: false,
      canManage: false, isActiveStudent: false, defaultPath: '/join',
      refreshUser: vi.fn().mockResolvedValue({}), logout: vi.fn(),
    }
  })
  const show = () => render(<MemoryRouter><WorkspaceStatusPage /></MemoryRouter>)

  it('waits for restoration rather than redirecting an identity that is still loading', () => {
    mocks.auth.isLoading = true
    mocks.auth.user = null
    show()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('requests membership explicitly and refreshes the canonical account', async () => {
    show()
    expect(screen.getByText('English · Cô Thuỳ')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    await userEvent.click(screen.getByRole('button', { name: 'Request access' }))
    await waitFor(() => expect(mocks.join).toHaveBeenCalledWith('english-token', { grades: [12] }))
    expect(mocks.auth.refreshUser).toHaveBeenCalled()
  })

  it.each(['pending', 'disabled'])('shows %s without offering a duplicate join, keeping Settings and logout', (status) => {
    mocks.auth.membership = { role: 'student', status, grades: [] }
    show()
    expect(screen.queryByRole('button', { name: 'Request access' })).not.toBeInTheDocument()
    expect(screen.getByText(status === 'pending' ? /waiting for teacher approval/ : /Contact your teacher/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
  })

  it('preserves the join form on a rejected request', async () => {
    mocks.join.mockRejectedValue(new Error('Please try again.'))
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Request access' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Please try again.')
    expect(screen.getByRole('button', { name: 'Request access' })).toBeEnabled()
  })
})
