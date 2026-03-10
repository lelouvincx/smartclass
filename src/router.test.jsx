import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { AppRoutes } from './router'

const useAuthMock = vi.fn()

vi.mock('./lib/auth-context', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => useAuthMock(),
}))

describe('route guards', () => {
  it('redirects unauthenticated user from /teacher to login', () => {
    useAuthMock.mockReturnValue({
      isLoading: false,
      user: null,
      logout: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/teacher']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    expect(screen.getByText('SmartClass Login')).toBeInTheDocument()
  })

  it('redirects teacher away from / to teacher dashboard', () => {
    useAuthMock.mockReturnValue({
      isLoading: false,
      user: { role: 'teacher', phone: '+84865481769' },
      logout: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    expect(screen.getByText('Teacher Dashboard')).toBeInTheDocument()
  })

  it('redirects student from /teacher to /student', () => {
    useAuthMock.mockReturnValue({
      isLoading: false,
      user: { role: 'student', phone: '+84900000001' },
      logout: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/teacher']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    expect(screen.getByText('Student Dashboard')).toBeInTheDocument()
  })
})
