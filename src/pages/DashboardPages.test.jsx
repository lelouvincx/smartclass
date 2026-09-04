import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import StudentDashboardPage from './StudentDashboardPage'
import TeacherDashboardPage from './TeacherDashboardPage'
import { setSubmissionPointer } from '@/lib/submission-draft'

const listExercisesMock = vi.fn()
const listLecturesMock = vi.fn()
const listStudentsMock = vi.fn()
const listMySubmissionsMock = vi.fn()
const getSubmissionMock = vi.fn()

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    listExercises: (...args) => listExercisesMock(...args),
    listLectures: (...args) => listLecturesMock(...args),
    listStudents: (...args) => listStudentsMock(...args),
    listMySubmissions: (...args) => listMySubmissionsMock(...args),
    getSubmission: (...args) => getSubmissionMock(...args),
  }
})

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ token: 'test-token', user: { id: 7, phone: '+84865481769' }, logout: vi.fn() }),
}))

describe('dashboard placeholders', () => {
  beforeEach(() => {
    sessionStorage.clear()
    listExercisesMock.mockReset()
    listExercisesMock.mockResolvedValue({ data: [] })
    listLecturesMock.mockReset()
    listLecturesMock.mockResolvedValue({ data: [] })
    listStudentsMock.mockReset()
    listStudentsMock.mockResolvedValue({ data: [] })
    listMySubmissionsMock.mockReset()
    listMySubmissionsMock.mockResolvedValue({ data: { submissions: [] } })
    getSubmissionMock.mockReset()
  })

  it('renders teacher dashboard with live class counts and nav links', async () => {
    listExercisesMock.mockResolvedValue({ data: [{ id: 1 }, { id: 2 }] })
    listLecturesMock.mockResolvedValue({ data: [{ id: 1 }, { id: 2 }, { id: 3 }] })
    listStudentsMock
      .mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] })
      .mockResolvedValueOnce({ data: [{ id: 5 }] })

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
    expect(await screen.findByText('4 active students')).toBeInTheDocument()
    expect(screen.getByText('1 pending approval')).toBeInTheDocument()
    expect(screen.getByText('2 exercises')).toBeInTheDocument()
    expect(screen.getByText('3 lectures')).toBeInTheDocument()
  })

  it('surfaces the student’s resumable exercise before generic quick actions', async () => {
    listExercisesMock.mockResolvedValue({
      data: [{ id: 42, title: 'Algebra Quiz', duration_minutes: 30, question_count: 10, is_timed: 1, is_student_ready: 1 }],
    })
    setSubmissionPointer(7, 42, 99)
    getSubmissionMock.mockResolvedValue({ data: { id: 99, exercise_id: 42, submitted_at: null } })

    render(
      <MemoryRouter>
        <StudentDashboardPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Student Dashboard', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Student quick actions' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /browse exercises/i })).toHaveAttribute('href', '/student/exercises')
    expect(screen.getByRole('link', { name: /view history/i })).toHaveAttribute('href', '/student/submissions')
    expect(await screen.findByRole('link', { name: /resume algebra quiz/i })).toHaveAttribute(
      'href',
      '/student/exercises/42/take',
    )
  })

  it('does not recommend an exercise that is not ready for students', async () => {
    listExercisesMock.mockResolvedValue({
      data: [{ id: 42, title: 'Draft Quiz', duration_minutes: 30, question_count: 10, is_timed: 1, is_student_ready: 0 }],
    })

    render(
      <MemoryRouter>
        <StudentDashboardPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Student Dashboard', level: 1 })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /start draft quiz/i })).not.toBeInTheDocument()
  })
})
