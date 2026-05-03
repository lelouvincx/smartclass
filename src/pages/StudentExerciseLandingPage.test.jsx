import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import StudentExerciseLandingPage from './StudentExerciseLandingPage'

// --- Mocks ---

const getExerciseMock = vi.fn()
const getSubmissionMock = vi.fn()
const listMySubmissionsMock = vi.fn()
const createSubmissionMock = vi.fn()

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getExercise: (...args) => getExerciseMock(...args),
    getSubmission: (...args) => getSubmissionMock(...args),
    listMySubmissions: (...args) => listMySubmissionsMock(...args),
    createSubmission: (...args) => createSubmissionMock(...args),
  }
})

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

// --- Fixtures ---

const TIMED_EXERCISE = {
  id: 1,
  title: 'Algebra Quiz',
  duration_minutes: 30,
  is_timed: 1,
  schema: [
    { q_id: 1, type: 'mcq', sub_id: null },
    { q_id: 2, type: 'mcq', sub_id: null },
  ],
}

const UNTIMED_EXERCISE = {
  ...TIMED_EXERCISE,
  id: 2,
  title: 'Practice Quiz',
  duration_minutes: 0,
  is_timed: 0,
}

// --- Render helper ---

function renderPage(exerciseId = '1') {
  return render(
    <MemoryRouter initialEntries={[`/student/exercises/${exerciseId}`]}>
      <Routes>
        <Route path="/student/exercises/:id" element={<StudentExerciseLandingPage />} />
        <Route path="/student/exercises/:id/take" element={<div>Take page</div>} />
        <Route path="/student/submissions/:id/summary" element={<div>Summary page</div>} />
        <Route path="/student/exercises" element={<div>Exercises list</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

// --- Tests ---

describe('StudentExerciseLandingPage', () => {
  beforeEach(() => {
    getExerciseMock.mockReset()
    getSubmissionMock.mockReset()
    listMySubmissionsMock.mockReset()
    createSubmissionMock.mockReset()
    sessionStorage.clear()
  })

  // --- Loading + error ---

  it('shows loading state while fetching', () => {
    getExerciseMock.mockImplementation(() => new Promise(() => {}))
    renderPage()
    expect(screen.getByText(/loading exercise/i)).toBeInTheDocument()
  })

  it('shows error and a Back link when fetch fails', async () => {
    getExerciseMock.mockRejectedValue(new Error('Exercise not found'))
    listMySubmissionsMock.mockResolvedValue({ data: { submissions: [] } })
    renderPage()
    expect(await screen.findByText(/exercise not found/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to exercises/i })).toBeInTheDocument()
  })

  // --- Metadata rendering ---

  it('shows the timed badge + duration for a timed exercise', async () => {
    getExerciseMock.mockResolvedValue({ data: TIMED_EXERCISE })
    listMySubmissionsMock.mockResolvedValue({ data: { submissions: [] } })

    renderPage()
    await screen.findByText('Algebra Quiz')
    expect(screen.getByText('Timed')).toBeInTheDocument()
    expect(screen.getByText(/30 min/i)).toBeInTheDocument()
    expect(screen.getByText(/2 questions/i)).toBeInTheDocument()
  })

  it('shows the untimed badge for an untimed exercise', async () => {
    getExerciseMock.mockResolvedValue({ data: UNTIMED_EXERCISE })
    listMySubmissionsMock.mockResolvedValue({ data: { submissions: [] } })

    renderPage('2')
    await screen.findByText('Practice Quiz')
    expect(screen.getByText('Untimed')).toBeInTheDocument()
    expect(screen.queryByText(/min$/i)).not.toBeInTheDocument()
  })

  it('counts distinct q_ids (boolean sub-rows count once)', async () => {
    const ex = {
      ...UNTIMED_EXERCISE,
      schema: [
        { q_id: 1, type: 'mcq', sub_id: null },
        { q_id: 2, type: 'boolean', sub_id: 'a' },
        { q_id: 2, type: 'boolean', sub_id: 'b' },
        { q_id: 2, type: 'boolean', sub_id: 'c' },
        { q_id: 2, type: 'boolean', sub_id: 'd' },
      ],
    }
    getExerciseMock.mockResolvedValue({ data: ex })
    listMySubmissionsMock.mockResolvedValue({ data: { submissions: [] } })

    renderPage('2')
    await screen.findByText('Practice Quiz')
    expect(screen.getByText(/2 questions/i)).toBeInTheDocument()
  })

  // --- Start (no resumable, no prior submission) ---

  it('shows a single Start button when there is no resumable session and no prior submission', async () => {
    getExerciseMock.mockResolvedValue({ data: TIMED_EXERCISE })
    listMySubmissionsMock.mockResolvedValue({ data: { submissions: [] } })

    renderPage()
    await screen.findByText('Algebra Quiz')

    expect(screen.getByRole('button', { name: /^Start$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument()
  })

  it('creates a submission and navigates to /take when Start is clicked', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: TIMED_EXERCISE })
    listMySubmissionsMock.mockResolvedValue({ data: { submissions: [] } })
    createSubmissionMock.mockResolvedValue({ data: { id: 99 } })

    renderPage()
    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Start$/i }))

    expect(createSubmissionMock).toHaveBeenCalledWith('test-token', { exercise_id: 1 })
    expect(sessionStorage.getItem('submission_1')).toBe('99')
    expect(await screen.findByText('Take page')).toBeInTheDocument()
  })

  it('surfaces a start error and re-enables the Start button', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: TIMED_EXERCISE })
    listMySubmissionsMock.mockResolvedValue({ data: { submissions: [] } })
    createSubmissionMock.mockRejectedValue(new Error('Network down'))

    renderPage()
    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Start$/i }))

    expect(await screen.findByText(/network down/i)).toBeInTheDocument()
  })

  // --- Resumable submission ---

  it('shows Resume + Start new buttons when an in-progress submission exists', async () => {
    sessionStorage.setItem('submission_1', '50')
    getExerciseMock.mockResolvedValue({ data: TIMED_EXERCISE })
    getSubmissionMock.mockResolvedValue({ data: { id: 50, submitted_at: null } })

    renderPage()
    await screen.findByText('Algebra Quiz')

    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start new/i })).toBeInTheDocument()
  })

  it('navigates to /take when Resume is clicked (without creating a new submission)', async () => {
    const user = userEvent.setup()
    sessionStorage.setItem('submission_1', '50')
    getExerciseMock.mockResolvedValue({ data: TIMED_EXERCISE })
    getSubmissionMock.mockResolvedValue({ data: { id: 50, submitted_at: null } })

    renderPage()
    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /resume/i }))

    expect(createSubmissionMock).not.toHaveBeenCalled()
    expect(await screen.findByText('Take page')).toBeInTheDocument()
  })

  it('clears stale sessionStorage when the saved submission is already submitted', async () => {
    sessionStorage.setItem('submission_1', '50')
    getExerciseMock.mockResolvedValue({ data: TIMED_EXERCISE })
    getSubmissionMock.mockResolvedValue({
      data: { id: 50, submitted_at: '2026-03-15 10:05:00' },
    })
    listMySubmissionsMock.mockResolvedValue({ data: { submissions: [] } })

    renderPage()
    await screen.findByText('Algebra Quiz')

    expect(sessionStorage.getItem('submission_1')).toBeNull()
    // Falls through to "no resumable" branch
    expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument()
  })

  it('clears stale sessionStorage when getSubmission throws', async () => {
    sessionStorage.setItem('submission_1', '50')
    getExerciseMock.mockResolvedValue({ data: TIMED_EXERCISE })
    getSubmissionMock.mockRejectedValue(new Error('not found'))
    listMySubmissionsMock.mockResolvedValue({ data: { submissions: [] } })

    renderPage()
    await screen.findByText('Algebra Quiz')

    expect(sessionStorage.getItem('submission_1')).toBeNull()
  })

  // --- Already-submitted banner ---

  it('shows the "already submitted" banner + View result link when a submitted submission exists', async () => {
    getExerciseMock.mockResolvedValue({ data: TIMED_EXERCISE })
    listMySubmissionsMock.mockResolvedValue({
      data: {
        submissions: [{ id: 77, submitted_at: '2026-03-15 10:05:00' }],
      },
    })

    renderPage()
    await screen.findByText('Algebra Quiz')

    expect(screen.getByText(/already submitted/i)).toBeInTheDocument()
    const viewLink = screen.getByRole('link', { name: /view result/i })
    expect(viewLink).toHaveAttribute('href', '/student/submissions/77/summary')
    // Start button should not be shown
    expect(screen.queryByRole('button', { name: /^Start$/i })).not.toBeInTheDocument()
  })

  it('ignores listMySubmissions errors silently (best-effort lookup)', async () => {
    getExerciseMock.mockResolvedValue({ data: TIMED_EXERCISE })
    listMySubmissionsMock.mockRejectedValue(new Error('boom'))

    renderPage()
    await screen.findByText('Algebra Quiz')

    // No banner, Start button still shown
    expect(screen.queryByText(/already submitted/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Start$/i })).toBeInTheDocument()
  })
})
