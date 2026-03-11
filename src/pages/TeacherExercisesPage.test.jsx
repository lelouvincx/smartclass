import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import TeacherExercisesPage from './TeacherExercisesPage'

const listExercisesMock = vi.fn()
const logoutMock = vi.fn()

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    listExercises: (...args) => listExercisesMock(...args),
  }
})

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({
    logout: logoutMock,
  }),
}))

describe('TeacherExercisesPage', () => {
  beforeEach(() => {
    listExercisesMock.mockReset()
    logoutMock.mockReset()
  })

  it('renders empty state when there are no exercises', async () => {
    listExercisesMock.mockResolvedValue({ data: [] })

    render(
      <MemoryRouter>
        <TeacherExercisesPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('No exercises yet.')).toBeInTheDocument()
  })

  it('renders exercise rows', async () => {
    listExercisesMock.mockResolvedValue({
      data: [
        {
          id: 1,
          title: 'Physics Quiz',
          duration_minutes: 45,
          question_count: 20,
          file_count: 2,
          updated_at: '2026-03-11 19:00:00',
        },
      ],
    })

    render(
      <MemoryRouter>
        <TeacherExercisesPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Physics Quiz')).toBeInTheDocument()
    expect(screen.getByText('45 min')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
  })

  it('reloads list when refresh icon button is clicked', async () => {
    const user = userEvent.setup()
    listExercisesMock.mockResolvedValue({ data: [] })

    render(
      <MemoryRouter>
        <TeacherExercisesPage />
      </MemoryRouter>,
    )

    await screen.findByText('No exercises yet.')
    await user.click(screen.getByRole('button', { name: 'Refresh exercises' }))

    expect(listExercisesMock).toHaveBeenCalledTimes(2)
  })
})
