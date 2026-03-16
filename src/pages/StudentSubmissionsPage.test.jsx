import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import StudentSubmissionsPage from './StudentSubmissionsPage'

const listMySubmissionsMock = vi.fn()
const navigateMock = vi.fn()

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    listMySubmissions: (...args) => listMySubmissionsMock(...args),
  }
})

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

const SUBMISSIONS = [
  {
    id: 10,
    exercise_id: 1,
    exercise_title: 'Algebra Quiz',
    mode: 'timed',
    score: 7.5,
    total_questions: 10,
    submitted_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
  },
  {
    id: 11,
    exercise_id: 2,
    exercise_title: 'Physics Test',
    mode: 'untimed',
    score: 3.0,
    total_questions: 5,
    submitted_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1d ago
  },
]

describe('StudentSubmissionsPage', () => {
  beforeEach(() => {
    listMySubmissionsMock.mockReset()
    navigateMock.mockReset()
  })

  it('shows empty state when there are no submissions', async () => {
    listMySubmissionsMock.mockResolvedValue({ data: { submissions: [], total: 0 } })

    render(
      <MemoryRouter>
        <StudentSubmissionsPage />
      </MemoryRouter>
    )

    expect(await screen.findByText(/no submissions yet/i)).toBeInTheDocument()
  })

  it('renders a table row for each submission', async () => {
    listMySubmissionsMock.mockResolvedValue({ data: { submissions: SUBMISSIONS, total: 2 } })

    render(
      <MemoryRouter>
        <StudentSubmissionsPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('Algebra Quiz')).toBeInTheDocument()
    expect(screen.getByText('Physics Test')).toBeInTheDocument()
  })

  it('displays scores with color-coded badges', async () => {
    listMySubmissionsMock.mockResolvedValue({ data: { submissions: SUBMISSIONS, total: 2 } })

    render(
      <MemoryRouter>
        <StudentSubmissionsPage />
      </MemoryRouter>
    )

    await screen.findByText('Algebra Quiz')
    // Score 7.5 shown as "7.5 / 10"
    expect(screen.getByText(/7\.5/)).toBeInTheDocument()
    // Score 3 shown as "3 / 10"
    expect(screen.getByText(/3/)).toBeInTheDocument()
  })

  it('renders a Review button for each submission', async () => {
    listMySubmissionsMock.mockResolvedValue({ data: { submissions: SUBMISSIONS, total: 2 } })

    render(
      <MemoryRouter>
        <StudentSubmissionsPage />
      </MemoryRouter>
    )

    await screen.findByText('Algebra Quiz')
    const reviewButtons = screen.getAllByRole('link', { name: /review/i })
    expect(reviewButtons).toHaveLength(2)
    expect(reviewButtons[0]).toHaveAttribute('href', '/student/submissions/10/review')
    expect(reviewButtons[1]).toHaveAttribute('href', '/student/submissions/11/review')
  })

  it('shows loading state while fetching', () => {
    listMySubmissionsMock.mockReturnValue(new Promise(() => {})) // never resolves

    render(
      <MemoryRouter>
        <StudentSubmissionsPage />
      </MemoryRouter>
    )

    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('calls listMySubmissions with the student token on mount', async () => {
    listMySubmissionsMock.mockResolvedValue({ data: { submissions: [], total: 0 } })

    render(
      <MemoryRouter>
        <StudentSubmissionsPage />
      </MemoryRouter>
    )

    await screen.findByText(/no submissions yet/i)
    expect(listMySubmissionsMock).toHaveBeenCalledWith('test-token', {})
  })
})
