import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect } from 'vitest'
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

describe('StudentLayout navigation', () => {
  it('marks the current destination in the student navigation', () => {
    renderLayout('/student/exercises')

    const navigation = screen.getByRole('navigation', { name: 'Student navigation' })
    expect(within(navigation).getByRole('link', { name: 'Exercises' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('opens a labelled mobile navigation dialog', async () => {
    const user = userEvent.setup()
    renderLayout()

    await user.click(screen.getByRole('button', { name: 'Open navigation' }))

    const dialog = screen.getByRole('dialog', { name: 'Student navigation' })
    expect(within(dialog).getByRole('link', { name: 'History' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })
})
