import React from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, vi, describe, it, expect } from 'vitest'
import { changeLanguage } from '@/i18n'
import { StudentLayout } from './student-layout'

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({ user: { phone: '+84900000001' }, logout: vi.fn() }),
}))

function renderLayout(initialEntry = '/student') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <StudentLayout />
    </MemoryRouter>,
  )
}

afterEach(() => act(() => changeLanguage('en')))

describe('StudentLayout navigation', () => {
  it('marks the current destination in the student navigation', () => {
    renderLayout('/student/exercises')

    const navigations = screen.getAllByRole('navigation', { name: 'Student navigation' })
    expect(navigations).toHaveLength(2)
    navigations.forEach((navigation) => {
      expect(within(navigation).getByRole('link', { name: 'Exercises' })).toHaveAttribute(
        'aria-current',
        'page',
      )
    })
  })

  it('opens a labelled mobile navigation dialog', async () => {
    const user = userEvent.setup()
    renderLayout()

    await user.click(screen.getByRole('button', { name: 'Open navigation' }))

    const dialog = screen.getByRole('dialog', { name: 'Student navigation' })
    expect(within(dialog).getByRole('link', { name: 'History' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('localizes the mobile navigation close button', async () => {
    const user = userEvent.setup()
    await act(() => changeLanguage('vi'))
    renderLayout()

    await user.click(screen.getByRole('button', { name: 'Mở điều hướng' }))

    const dialog = screen.getByRole('dialog', { name: 'Điều hướng học sinh' })
    expect(within(dialog).getByRole('button', { name: 'Đóng' })).toBeInTheDocument()
  })
})
