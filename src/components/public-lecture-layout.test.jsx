import React from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { changeLanguage, LANGUAGE_STORAGE_KEY } from '@/i18n'
import { PublicLectureLayout } from './public-lecture-layout'

const useAuthMock = vi.fn()

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => useAuthMock(),
}))

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/lectures']}>
      <Routes>
        <Route element={<PublicLectureLayout />}>
          <Route path="/lectures" element={<p>Public lectures</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  localStorage.clear()
  return act(() => changeLanguage('en'))
})

describe('PublicLectureLayout', () => {
  it('shows Guest navigation with lectures available and exercises disabled', () => {
    useAuthMock.mockReturnValue({ user: null })

    renderLayout()

    const navigations = screen.getAllByRole('navigation', { name: 'Guest navigation' })
    expect(navigations).toHaveLength(2)
    navigations.forEach((navigation) => {
      expect(within(navigation).getByRole('link', { name: 'Lectures' })).toHaveAttribute(
        'aria-current',
        'page',
      )
      expect(within(navigation).getByRole('button', { name: 'Exercises - Coming soon' })).toBeDisabled()
      expect(within(navigation).queryByRole('link', { name: /Exercises/ })).not.toBeInTheDocument()
    })
    expect(screen.getAllByRole('link', { name: 'Sign in' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Maths · Thầy Thành').length).toBeGreaterThan(0)
  })

  it('lets a Guest change and persist the interface language', async () => {
    useAuthMock.mockReturnValue({ user: null })

    renderLayout()

    const languageSelectors = screen.getAllByRole('combobox', { name: 'Language' })
    expect(languageSelectors.length).toBeGreaterThan(0)

    fireEvent.change(languageSelectors[0], { target: { value: 'vi' } })

    expect(await screen.findAllByRole('navigation', { name: 'Điều hướng Khách' })).toHaveLength(2)
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('vi')
    expect(document.documentElement.lang).toBe('vi')
  })

  it('links an authenticated viewer back to their workspace', () => {
    useAuthMock.mockReturnValue({
      user: { platform_role: 'user', disabled_at: null },
      membership: { role: 'student', status: 'active' },
      defaultPath: '/student',
    })

    renderLayout()

    screen.getAllByRole('link', { name: 'Open workspace' }).forEach((link) => {
      expect(link).toHaveAttribute('href', '/student')
    })
  })
})
