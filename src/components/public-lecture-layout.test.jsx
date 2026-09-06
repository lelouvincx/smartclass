import React from 'react'
import { act, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { changeLanguage } from '@/i18n'
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
      expect(within(navigation).getByRole('button', { name: 'Exercises — Coming soon' })).toBeDisabled()
      expect(within(navigation).queryByRole('link', { name: /Exercises/ })).not.toBeInTheDocument()
    })
    expect(screen.getAllByRole('link', { name: 'Sign in' }).length).toBeGreaterThan(0)
  })

  it('links an authenticated viewer back to their workspace', () => {
    useAuthMock.mockReturnValue({ user: { role: 'student' } })

    renderLayout()

    screen.getAllByRole('link', { name: 'Open workspace' }).forEach((link) => {
      expect(link).toHaveAttribute('href', '/student')
    })
  })
})
