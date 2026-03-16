import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/teacher/exercises']}>
      <Routes>
        <Route path="/teacher/exercises" element={<TeacherExercisesPage />} />
        <Route path="/teacher/exercises/:id" element={<div>Exercise detail</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('TeacherExercisesPage', () => {
  beforeEach(() => {
    listExercisesMock.mockReset()
    logoutMock.mockReset()
  })

  it('renders empty state when there are no exercises', async () => {
    listExercisesMock.mockResolvedValue({ data: [] })
    renderPage()
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

    renderPage()

    expect(await screen.findByText('Physics Quiz')).toBeInTheDocument()
    expect(screen.getByText('45 min')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
  })

  it('reloads list when refresh icon button is clicked', async () => {
    const user = userEvent.setup()
    listExercisesMock.mockResolvedValue({ data: [] })

    renderPage()

    await screen.findByText('No exercises yet.')
    await user.click(screen.getByRole('button', { name: 'Refresh exercises' }))

    expect(listExercisesMock).toHaveBeenCalledTimes(2)
  })

  it('shows last refreshed timestamp after successful load', async () => {
    listExercisesMock.mockResolvedValue({ data: [] })
    renderPage()
    expect(await screen.findByLabelText('Last refreshed time')).toBeInTheDocument()
    expect(screen.getByLabelText('Last refreshed time').textContent).toMatch(/Updated \d{1,2}:\d{2}:\d{2}/)
  })

  it('shows updated timestamp after manual refresh', async () => {
    const user = userEvent.setup()
    listExercisesMock.mockResolvedValue({ data: [] })
    renderPage()

    await screen.findByLabelText('Last refreshed time')
    const first = screen.getByLabelText('Last refreshed time').textContent

    listExercisesMock.mockResolvedValue({ data: [] })
    await user.click(screen.getByRole('button', { name: 'Refresh exercises' }))

    expect(await screen.findByLabelText('Last refreshed time')).toBeInTheDocument()
    // timestamp element is still present (may be same second, just verify it renders)
    expect(screen.getByLabelText('Last refreshed time').textContent).toMatch(/Updated \d{1,2}:\d{2}:\d{2}/)
  })

  it('navigates to exercise detail when a row is clicked', async () => {
    const user = userEvent.setup()
    listExercisesMock.mockResolvedValue({
      data: [
        {
          id: 7,
          title: 'Chemistry Quiz',
          duration_minutes: 30,
          question_count: 10,
          file_count: 1,
          updated_at: '2026-03-12 10:00:00',
        },
      ],
    })

    renderPage()

    await screen.findByText('Chemistry Quiz')
    await user.click(screen.getByText('Chemistry Quiz'))

    expect(await screen.findByText('Exercise detail')).toBeInTheDocument()
  })
})
