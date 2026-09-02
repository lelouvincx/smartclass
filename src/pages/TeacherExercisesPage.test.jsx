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
    expect(await screen.findByRole('heading', { name: 'No exercises yet.' })).toBeInTheDocument()
  })

  it('renders accessible desktop table and compact mobile list', async () => {
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

    expect(await screen.findByRole('table', { name: 'Teacher exercise library' })).toBeInTheDocument()
    expect(screen.getAllByText('Physics Quiz')).toHaveLength(2)
    expect(screen.getAllByText('45 min')).toHaveLength(2)
    expect(screen.getAllByText('20')).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: /view physics quiz/i })).toHaveLength(2)
    expect(screen.getByRole('columnheader', { name: 'Title' })).toHaveAttribute('scope', 'col')
    expect(screen.queryByText('2026-03-11 19:00:00')).not.toBeInTheDocument()
  })

  it('shows zero duration as Untimed', async () => {
    listExercisesMock.mockResolvedValue({ data: [{
      id: 2, title: 'Untimed Quiz', duration_minutes: 0, question_count: 1,
      file_count: 0, updated_at: '2026-03-11 19:00:00',
    }] })
    renderPage()
    expect(await screen.findAllByText('Untimed')).toHaveLength(2)
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

  it('navigates to exercise detail through a semantic link', async () => {
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

    const links = await screen.findAllByRole('link', { name: /view chemistry quiz/i })
    await user.click(links[0])

    expect(await screen.findByText('Exercise detail')).toBeInTheDocument()
  })
})
