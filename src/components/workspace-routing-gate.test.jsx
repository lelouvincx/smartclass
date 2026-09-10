import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { WorkspaceRoutingGate } from './workspace-routing-gate'
import { AUTH_TOKEN_KEY } from '@/lib/auth'

const auth = vi.hoisted(() => ({ value: {} }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => auth.value }))

describe('canonical teaching-site routing', () => {
  beforeEach(() => {
    localStorage.clear()
    auth.value = {
      user: { id: 8, platform_role: 'user', disabled_at: null },
      workspace: { id: 'maths' }, membership: null, isLoading: false,
      teacherRouting: { action: 'stay' }, logout: vi.fn(),
    }
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  function renderGate() {
    return render(<WorkspaceRoutingGate><p>Join or protected content</p></WorkspaceRoutingGate>)
  }

  it('redirects before rendering join, without carrying callback credentials', async () => {
    localStorage.setItem(AUTH_TOKEN_KEY, 'english-teacher-token-on-maths-site')
    const replace = vi.fn(() => {
      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull()
    })
    vi.stubGlobal('window', { ...window, location: { origin: 'http://maths.test', replace } })
    auth.value.teacherRouting = { action: 'redirect', destinations: [{ workspace_id: 'english', url: 'http://english.test' }] }
    renderGate()
    expect(screen.queryByText('Join or protected content')).not.toBeInTheDocument()
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull()
    expect(replace).toHaveBeenCalledWith('http://english.test')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('offers only configured choices and never renders the student join form', () => {
    auth.value.teacherRouting = { action: 'choose', destinations: [{ workspace_id: 'english', url: 'http://english.test' }] }
    renderGate()
    expect(screen.queryByText('Join or protected content')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /English/ })).toHaveAttribute('href', 'http://english.test')
  })

  it('clears only the departing origin token before chooser link navigation', () => {
    localStorage.setItem(AUTH_TOKEN_KEY, 'english-teacher-token-on-maths-site')
    auth.value.teacherRouting = { action: 'choose', destinations: [{ workspace_id: 'english', url: 'http://english.test' }] }
    renderGate()
    const link = screen.getByRole('link', { name: /English/ })
    link.addEventListener('click', (event) => event.preventDefault())
    fireEvent.click(link)
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull()
    expect(screen.queryByText('Join or protected content')).not.toBeInTheDocument()
  })

  it.each(['http://evil.test', 'http://english.test?token=secret', 'http://maths.test'])('fails closed for an unsafe or looping destination: %s', (url) => {
    localStorage.setItem(AUTH_TOKEN_KEY, 'current-site-token')
    auth.value.teacherRouting = { action: 'redirect', destinations: [{ workspace_id: 'english', url }] }
    renderGate()
    expect(screen.getByRole('alert')).toHaveTextContent(/cannot open/i)
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe('current-site-token')
    expect(screen.queryByText('Join or protected content')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('keeps the platform administrator on the current site', () => {
    auth.value.user.platform_role = 'platform_admin'
    auth.value.teacherRouting = { action: 'redirect', destinations: [{ workspace_id: 'english', url: 'http://english.test' }] }
    renderGate()
    expect(screen.getByText('Join or protected content')).toBeInTheDocument()
  })

  it('fails closed on an unsupported frontend host', () => {
    vi.stubGlobal('window', { ...window, location: { origin: 'http://unknown.test' } })
    renderGate()
    expect(screen.getByRole('alert')).toHaveTextContent(/not configured/i)
    expect(screen.queryByText('Join or protected content')).not.toBeInTheDocument()
  })
})
