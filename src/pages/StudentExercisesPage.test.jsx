import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import StudentExercisesPage from './StudentExercisesPage'
import { setSubmissionPointer } from '@/lib/submission-draft'

const listExercisesMock = vi.fn()
const listMySubmissionsMock = vi.fn()
const getSubmissionMock = vi.fn()
const logoutMock = vi.fn()

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    listExercises: (...args) => listExercisesMock(...args),
    listMySubmissions: (...args) => listMySubmissionsMock(...args),
    getSubmission: (...args) => getSubmissionMock(...args),
  }
})

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({
    token: 'student-token',
    user: { id: 7 },
    logout: logoutMock,
  }),
}))

describe('StudentExercisesPage', () => {
  beforeEach(() => {
    listExercisesMock.mockReset()
    listMySubmissionsMock.mockReset()
    listMySubmissionsMock.mockResolvedValue({ data: { submissions: [] } })
    getSubmissionMock.mockReset()
    logoutMock.mockReset()
    sessionStorage.clear()
  })

  it('renders empty state with encouraging message when there are no exercises', async () => {
    listExercisesMock.mockResolvedValue({ data: [] })

    render(
      <MemoryRouter>
        <StudentExercisesPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: /no exercises yet/i })).toBeInTheDocument()
    expect(screen.getByText(/check back soon/i)).toBeInTheDocument()
  })

  it('renders an accessible table and compact mobile list with metadata', async () => {
    listExercisesMock.mockResolvedValue({
      data: [
        {
          id: 1,
          title: 'Algebra Quiz',
          description: 'Test your algebra skills',
          duration_minutes: 30,
          question_count: 15,
          is_timed: 1,
          is_student_ready: 1,
        },
      ],
    })

    render(
      <MemoryRouter>
        <StudentExercisesPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('table', { name: 'Available exercises' })).toBeInTheDocument()
    expect(screen.getAllByText('Algebra Quiz')).toHaveLength(2)
    expect(screen.getAllByText('30 min')).toHaveLength(2)
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('15 questions')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /start algebra quiz/i })).toHaveLength(2)
    expect(screen.getByRole('columnheader', { name: 'Title' })).toHaveAttribute('scope', 'col')
  })

  it('shows timed badge for timed exercises and untimed for untimed exercises', async () => {
    listExercisesMock.mockResolvedValue({
      data: [
        { id: 1, title: 'Timed Quiz', duration_minutes: 45, question_count: 10, is_timed: 1, is_student_ready: 1 },
        { id: 2, title: 'Practice Set', duration_minutes: 0, question_count: 5, is_timed: 0, is_student_ready: 1 },
      ],
    })

    render(
      <MemoryRouter>
        <StudentExercisesPage />
      </MemoryRouter>,
    )

    expect(await screen.findAllByText('Timed Quiz')).toHaveLength(2)

    const timedBadges = screen.getAllByText('Timed')
    expect(timedBadges).toHaveLength(2)

    const untimedBadges = screen.getAllByText('Untimed')
    expect(untimedBadges).toHaveLength(2)
  })

  it('links to the exercise page from each Start action', async () => {
    listExercisesMock.mockResolvedValue({
      data: [{ id: 42, title: 'Quiz', duration_minutes: 30, question_count: 10, is_timed: 1, is_student_ready: 1 }],
    })

    render(
      <MemoryRouter>
        <StudentExercisesPage />
      </MemoryRouter>,
    )

    const startLinks = await screen.findAllByRole('link', { name: /start quiz/i })
    expect(startLinks).toHaveLength(2)
    expect(startLinks[0]).toHaveAttribute('href', '/student/exercises/42')
  })

  it('labels an in-progress exercise as Resume', async () => {
    listExercisesMock.mockResolvedValue({
      data: [{ id: 42, title: 'Quiz', duration_minutes: 30, question_count: 10, is_timed: 1, is_student_ready: 1 }],
    })
    setSubmissionPointer(7, 42, 99)
    getSubmissionMock.mockResolvedValue({ data: { id: 99, exercise_id: 42, submitted_at: null } })

    render(
      <MemoryRouter>
        <StudentExercisesPage />
      </MemoryRouter>,
    )

    const resumeLinks = await screen.findAllByRole('link', { name: /resume quiz/i })
    expect(resumeLinks).toHaveLength(2)
    expect(resumeLinks[0]).toHaveAttribute('href', '/student/exercises/42/take')
  })

  it('restores Resume from server state after grade access changes', async () => {
    listExercisesMock.mockResolvedValue({
      data: [{
        id: 42,
        title: 'Quiz',
        duration_minutes: 30,
        question_count: 10,
        is_timed: 1,
        is_student_ready: 0,
        in_progress_submission_id: 99,
      }],
    })

    render(
      <MemoryRouter>
        <StudentExercisesPage />
      </MemoryRouter>,
    )

    const resumeLinks = await screen.findAllByRole('link', { name: /resume quiz/i })
    expect(resumeLinks[0]).toHaveAttribute('href', '/student/exercises/42/take')
  })

  it('labels a completed exercise as View result', async () => {
    listExercisesMock.mockResolvedValue({
      data: [{ id: 42, title: 'Quiz', duration_minutes: 30, question_count: 10, is_timed: 1, is_student_ready: 1 }],
    })
    listMySubmissionsMock.mockResolvedValue({
      data: { submissions: [{ id: 88, exercise_id: 42, submitted_at: '2026-09-03 05:00:00' }] },
    })

    render(
      <MemoryRouter>
        <StudentExercisesPage />
      </MemoryRouter>,
    )

    const resultLinks = await screen.findAllByRole('link', { name: /view quiz result/i })
    expect(resultLinks).toHaveLength(2)
    expect(resultLinks[0]).toHaveAttribute('href', '/student/submissions/88/summary')
  })

  it('displays error message when API fails', async () => {
    listExercisesMock.mockRejectedValue(new Error('Network error'))

    render(
      <MemoryRouter>
        <StudentExercisesPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/network error/i)).toBeInTheDocument()
  })

  it('hides exercises that have not been activated for students', async () => {
    listExercisesMock.mockResolvedValue({
      data: [
        { id: 1, title: 'Ready Quiz', duration_minutes: 30, question_count: 10, is_timed: 1, is_student_ready: 1 },
        { id: 2, title: 'Draft Quiz', duration_minutes: 30, question_count: 10, is_timed: 1, is_student_ready: 0 },
      ],
    })

    render(
      <MemoryRouter>
        <StudentExercisesPage />
      </MemoryRouter>,
    )

    expect(await screen.findAllByText('Ready Quiz')).toHaveLength(2)
    expect(screen.queryByText('Draft Quiz')).not.toBeInTheDocument()
  })

  it('shows loading indicator while fetching', () => {
    listExercisesMock.mockImplementation(() => new Promise(() => {})) // never resolves

    render(
      <MemoryRouter>
        <StudentExercisesPage />
      </MemoryRouter>,
    )

    expect(screen.getByText(/loading exercises/i)).toBeInTheDocument()
  })

  it('shows last refreshed timestamp after successful load', async () => {
    listExercisesMock.mockResolvedValue({ data: [] })

    render(
      <MemoryRouter>
        <StudentExercisesPage />
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText('Last refreshed time')).toBeInTheDocument()
    expect(screen.getByLabelText('Last refreshed time').textContent).toMatch(/Updated \d{1,2}:\d{2}:\d{2}/)
  })

  it('reloads exercises when refresh button clicked', async () => {
    const user = userEvent.setup()
    listExercisesMock.mockResolvedValue({ data: [] })

    render(
      <MemoryRouter>
        <StudentExercisesPage />
      </MemoryRouter>,
    )

    await screen.findByText(/no exercises yet/i)
    await user.click(screen.getByRole('button', { name: /refresh/i }))

    expect(listExercisesMock).toHaveBeenCalledTimes(2)
  })
})
