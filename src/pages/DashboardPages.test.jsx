import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import StudentDashboardPage from './StudentDashboardPage'
import TeacherDashboardPage from './TeacherDashboardPage'

const authState = {
  user: { phone: '+84865481769' },
  logout: vi.fn(),
}

vi.mock('../lib/auth-context', () => ({
  useAuth: () => authState,
}))

describe('dashboard placeholders', () => {
  beforeEach(() => {
    authState.logout.mockReset()
  })

  it('renders teacher dashboard with account phone', () => {
    authState.user = { phone: '+84865481769' }

    render(
      <MemoryRouter>
        <TeacherDashboardPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Teacher Dashboard')).toBeInTheDocument()
    expect(screen.getByText('+84865481769')).toBeInTheDocument()
  })

  it('calls logout from student dashboard', async () => {
    const user = userEvent.setup()
    authState.user = { phone: '+84900000001' }

    render(
      <MemoryRouter>
        <StudentDashboardPage />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'Logout' }))
    expect(authState.logout).toHaveBeenCalledTimes(1)
  })
})
