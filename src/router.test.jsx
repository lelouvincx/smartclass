import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, vi } from 'vitest'
import { changeLanguage } from './i18n'
import { AppRoutes } from './router'

const useAuthMock = vi.fn()
const listLecturesMock = vi.fn()

vi.mock('./lib/auth-context', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => useAuthMock(),
}))

vi.mock('./lib/api', async (importOriginal) => ({
  ...await importOriginal(),
  listLectures: (...args) => listLecturesMock(...args),
}))

afterEach(() => act(() => changeLanguage('en')))

describe('route guards', () => {
  it('keeps public Guest lectures outside the authentication guard', async () => {
    useAuthMock.mockReturnValue({ isLoading: false, user: null, token: null, logout: vi.fn() })
    listLecturesMock.mockResolvedValue({
      data: [{ id: 1, title: 'Public lesson', section_name: 'Preview', youtube_url: 'https://youtu.be/abcdefghijk' }],
    })

    render(
      <MemoryRouter initialEntries={['/lectures']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Public lesson')).toBeInTheDocument()
    screen.getAllByRole('link', { name: 'Sign in' }).forEach((link) => {
      expect(link).toHaveAttribute('href', '/')
    })
    expect(listLecturesMock).toHaveBeenCalledWith(null)
  })

  it('keeps the unauthenticated loading state in English', async () => {
    await act(() => changeLanguage('vi'))
    useAuthMock.mockReturnValue({
      isLoading: true,
      user: null,
      logout: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

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
