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
  listStudents: vi.fn().mockResolvedValue({ data: [] }),
  listExercises: vi.fn().mockResolvedValue({ data: [] }),
}))

afterEach(() => act(() => changeLanguage('en')))

describe('route guards', () => {
  it.each([null, 'pending', 'disabled'])('denies learning and management to membership status %s while allowing Settings', async (status) => {
    useAuthMock.mockReturnValue({
      isLoading: false, token: 'token', user: { id: 7, platform_role: 'user', disabled_at: null },
      membership: status ? { role: 'student', status, grades: [] } : null,
      workspace: { id: 'maths' }, teacherRouting: { action: 'stay' },
      canManage: false, isActiveStudent: false, defaultPath: '/join', logout: vi.fn(),
    })
    const { unmount } = render(<MemoryRouter initialEntries={['/student']}><AppRoutes /></MemoryRouter>)
    expect(screen.queryByText('Student Dashboard')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    unmount()
    render(<MemoryRouter initialEntries={['/settings']}><AppRoutes /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  })

  it('does not grant access from a legacy role on the shared identity', () => {
    useAuthMock.mockReturnValue({
      isLoading: false, user: { id: 7, role: 'teacher', platform_role: 'user' },
      membership: null, workspace: { id: 'maths' }, logout: vi.fn(),
    })
    render(<MemoryRouter initialEntries={['/teacher']}><AppRoutes /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Request access' })).toBeInTheDocument()
    expect(screen.queryByText('Teacher Dashboard')).not.toBeInTheDocument()
  })

  it('opens management for an administrator without a teacher membership', () => {
    useAuthMock.mockReturnValue({
      isLoading: false, user: { id: 1, name: 'Chinh', platform_role: 'platform_admin' },
      membership: null, workspace: { id: 'maths' }, isPlatformAdmin: true,
      canManage: true, defaultPath: '/teacher', logout: vi.fn(),
    })
    render(<MemoryRouter initialEntries={['/teacher']}><AppRoutes /></MemoryRouter>)
    expect(screen.getByText('Teacher Dashboard')).toBeInTheDocument()
    expect(screen.getAllByText('Platform administrator').length).toBeGreaterThan(0)
  })

  it('keeps public Guest lectures outside the authentication guard', async () => {
    useAuthMock.mockReturnValue({ isLoading: false, user: null, token: null, logout: vi.fn(), defaultPath: '/' })
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
      defaultPath: '/',
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
      defaultPath: '/',
    })

    render(
      <MemoryRouter initialEntries={['/teacher']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    expect(screen.getByText('SmartClass')).toBeInTheDocument()
  })

  it('redirects teacher away from / to teacher dashboard', () => {
    useAuthMock.mockReturnValue({
      isLoading: false,
      user: { phone: '+84865481769', platform_role: 'user' },
      membership: { role: 'teacher', status: 'active' },
      canManage: true,
      isActiveStudent: false,
      defaultPath: '/teacher',
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
      user: { phone: '+84900000001', platform_role: 'user', disabled_at: null },
      membership: { role: 'student', status: 'active' },
      canManage: false,
      isActiveStudent: true,
      defaultPath: '/student',
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
