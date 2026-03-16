import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import StudentDashboardPage from './StudentDashboardPage'
import TeacherDashboardPage from './TeacherDashboardPage'

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { phone: '+84865481769' }, logout: vi.fn() }),
}))

describe('dashboard placeholders', () => {
  it('renders teacher dashboard with title and nav links', () => {
    render(
      <MemoryRouter>
        <TeacherDashboardPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Teacher Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Manage Exercises')).toBeInTheDocument()
    expect(screen.getByText('Create Exercise')).toBeInTheDocument()
  })

  it('renders student dashboard with quick actions', () => {
    render(
      <MemoryRouter>
        <StudentDashboardPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Student Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Browse Exercises')).toBeInTheDocument()
    expect(screen.getByText('View History')).toBeInTheDocument()
  })
})
