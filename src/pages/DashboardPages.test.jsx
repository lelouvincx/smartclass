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

    expect(screen.getByRole('heading', { name: 'Teacher Dashboard', level: 1 })).toBeInTheDocument()
    const manageExercises = screen.getByRole('link', { name: /manage exercises/i })
    expect(manageExercises).toHaveAttribute('href', '/teacher/exercises')
    expect(manageExercises).not.toHaveClass('min-h-28')
    expect(screen.getByRole('link', { name: /create exercise/i })).toHaveAttribute('href', '/teacher/exercises/new')
    expect(screen.getByRole('link', { name: /manage students/i })).toHaveAttribute('href', '/teacher/students')
  })

  it('renders student dashboard with quick actions', () => {
    render(
      <MemoryRouter>
        <StudentDashboardPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Student Dashboard', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Student quick actions' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /browse exercises/i })).toHaveAttribute('href', '/student/exercises')
    expect(screen.getByRole('link', { name: /view history/i })).toHaveAttribute('href', '/student/submissions')
  })
})
