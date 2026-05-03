import React from 'react'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import StudentTakeExercisePage from './StudentTakeExercisePage'

// --- Mocks ---

const getExerciseMock = vi.fn()
const createSubmissionMock = vi.fn()
const getSubmissionMock = vi.fn()
const submitAnswersMock = vi.fn()

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getExercise: (...args) => getExerciseMock(...args),
    createSubmission: (...args) => createSubmissionMock(...args),
    getSubmission: (...args) => getSubmissionMock(...args),
    submitAnswers: (...args) => submitAnswersMock(...args),
  }
})

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({
    token: 'test-token',
  }),
}))

const toastMock = vi.hoisted(() => ({
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: toastMock }))

// AnswerImageUpload renders the upload UI; the take page only handles the toggle
// + merge. Stub it with a button that triggers a known extraction payload.
vi.mock('@/components/answer-image-upload', () => ({
  __esModule: true,
  default: ({ onExtracted }) => (
    <button
      type="button"
      data-testid="stub-extract-fire"
      onClick={() =>
        onExtracted({
          extracted: [
            { q_id: 1, sub_id: null, answer: 'B', confidence: 0.9 },
            { q_id: 2, sub_id: null, answer: 'C', confidence: 0.4 },
          ],
          warnings: [],
          model_used: 'x-ai/grok-4.1-fast',
        })
      }
    >
      stub extract
    </button>
  ),
}))

// --- Fixtures ---

const EXERCISE_MCQ = {
  id: 1,
  title: 'Algebra Quiz',
  duration_minutes: 30,
  is_timed: 1,
  schema: [
    { q_id: 1, type: 'mcq', sub_id: null },
    { q_id: 2, type: 'mcq', sub_id: null },
  ],
}

// Boolean questions use 4 sub-rows (a,b,c,d) per question
const EXERCISE_MIXED = {
  id: 2,
  title: 'Mixed Quiz',
  duration_minutes: 0,
  is_timed: 0,
  schema: [
    { q_id: 1, type: 'mcq', sub_id: null },
    { q_id: 2, type: 'boolean', sub_id: 'a' },
    { q_id: 2, type: 'boolean', sub_id: 'b' },
    { q_id: 2, type: 'boolean', sub_id: 'c' },
    { q_id: 2, type: 'boolean', sub_id: 'd' },
    { q_id: 3, type: 'numeric', sub_id: null },
  ],
}

const SUBMISSION = {
  id: 10,
  exercise_id: 1,
  mode: 'timed',
  total_questions: 2,
  started_at: '2026-03-15 10:00:00',
  submitted_at: null,
}

// --- Render helper ---

function renderPage(exerciseId = '1') {
  sessionStorage.setItem(`submission_${exerciseId}`, '10')
  return render(
    <MemoryRouter initialEntries={[`/student/exercises/${exerciseId}/take`]}>
      <Routes>
        <Route path="/student/exercises/:id/take" element={<StudentTakeExercisePage />} />
        <Route path="/student/exercises/:id" element={<div>Exercise landing</div>} />
        <Route path="/student/exercises" element={<div>Exercises list</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

// --- Tests ---

describe('StudentTakeExercisePage', () => {
  beforeEach(() => {
    getExerciseMock.mockReset()
    createSubmissionMock.mockReset()
    getSubmissionMock.mockReset()
    submitAnswersMock.mockReset()
    sessionStorage.clear()
  })

  // --- Loading and error states ---

  it('shows loading indicator while fetching', () => {
    getExerciseMock.mockImplementation(() => new Promise(() => {}))
    getSubmissionMock.mockImplementation(() => new Promise(() => {}))

    renderPage()

    expect(screen.getByText(/loading exercise/i)).toBeInTheDocument()
  })

  it('shows error message when exercise fetch fails', async () => {
    getExerciseMock.mockRejectedValue(new Error('Exercise not found'))
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()

    expect(await screen.findByText(/exercise not found/i)).toBeInTheDocument()
  })

  it('redirects to exercise landing when no sessionStorage entry exists', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    // sessionStorage empty — do NOT call renderPage (which pre-populates it)
    render(
      <MemoryRouter initialEntries={['/student/exercises/1/take']}>
        <Routes>
          <Route path="/student/exercises/:id/take" element={<StudentTakeExercisePage />} />
          <Route path="/student/exercises/:id" element={<div>Exercise landing</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Exercise landing')).toBeInTheDocument()
  })

  // --- Exercise rendering ---

  it('renders exercise title and question count after loading', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()

    expect(await screen.findByText('Algebra Quiz')).toBeInTheDocument()
    expect(screen.getByText(/2 questions/i)).toBeInTheDocument()
  })

  it('shows distinct question count (not raw schema row count) for exercises with boolean sub-rows', async () => {
    // EXERCISE_MIXED has 6 schema rows: 1 mcq + 4 boolean sub-rows + 1 numeric = 3 distinct questions
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MIXED })
    getSubmissionMock.mockResolvedValue({ data: { ...SUBMISSION, exercise_id: 2, mode: 'untimed' } })

    renderPage('2')

    expect(await screen.findByText('Mixed Quiz')).toBeInTheDocument()
    expect(screen.getByText(/3 questions/i)).toBeInTheDocument()
  })

  it('renders MCQ option buttons for mcq-type questions', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()

    await screen.findByText('Algebra Quiz')

    expect(screen.getByLabelText('Question 1 option A')).toBeInTheDocument()
    expect(screen.getByLabelText('Question 1 option B')).toBeInTheDocument()
    expect(screen.getByLabelText('Question 1 option C')).toBeInTheDocument()
    expect(screen.getByLabelText('Question 1 option D')).toBeInTheDocument()
  })

  it('renders 4 True/False sub-question rows for boolean-type questions', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MIXED })
    getSubmissionMock.mockResolvedValue({ data: { ...SUBMISSION, exercise_id: 2, mode: 'untimed' } })

    renderPage('2')

    await screen.findByText('Mixed Quiz')

    // Should show True/False radios for each sub-question (a,b,c,d) of q_id=2
    expect(screen.getByLabelText('Question 2 sub a True')).toBeInTheDocument()
    expect(screen.getByLabelText('Question 2 sub a False')).toBeInTheDocument()
    expect(screen.getByLabelText('Question 2 sub b True')).toBeInTheDocument()
    expect(screen.getByLabelText('Question 2 sub b False')).toBeInTheDocument()
    expect(screen.getByLabelText('Question 2 sub c True')).toBeInTheDocument()
    expect(screen.getByLabelText('Question 2 sub c False')).toBeInTheDocument()
    expect(screen.getByLabelText('Question 2 sub d True')).toBeInTheDocument()
    expect(screen.getByLabelText('Question 2 sub d False')).toBeInTheDocument()
  })

  it('renders numeric input for numeric-type questions', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MIXED })
    getSubmissionMock.mockResolvedValue({ data: { ...SUBMISSION, exercise_id: 2, mode: 'untimed' } })

    renderPage('2')

    await screen.findByText('Mixed Quiz')

    expect(screen.getByLabelText('Question 3 numeric answer')).toBeInTheDocument()
  })

  // --- Timer ---

  it('shows timer for timed exercise based on elapsed time', async () => {
    const now = new Date()
    const startedAt = now.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')
    const sub = { ...SUBMISSION, started_at: startedAt }

    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: sub })

    renderPage()

    await screen.findByText('Algebra Quiz')

    const timerText = screen.getByLabelText('Timer').textContent
    expect(timerText).toMatch(/^(30:00|29:5\d)$/)
  })

  it('does not show timer for untimed exercise', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MIXED })
    getSubmissionMock.mockResolvedValue({ data: { ...SUBMISSION, mode: 'untimed' } })

    renderPage('2')

    await screen.findByText('Mixed Quiz')

    expect(screen.queryByLabelText('Timer')).not.toBeInTheDocument()
  })

  it('counts down the timer every second', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })

    const now = new Date()
    const startedAt = now.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')
    const sub = { ...SUBMISSION, started_at: startedAt }

    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: sub })

    renderPage()

    await screen.findByText('Algebra Quiz')

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(screen.getByLabelText('Timer')).toHaveTextContent('29:55')

    vi.useRealTimers()
  })

  it('shows overtime warning and counts up when time expires', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })

    const now = new Date()
    const startedAt = now.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')
    const sub = { ...SUBMISSION, started_at: startedAt }

    const shortExercise = { ...EXERCISE_MCQ, duration_minutes: 1 }
    getExerciseMock.mockResolvedValue({ data: shortExercise })
    getSubmissionMock.mockResolvedValue({ data: sub })

    renderPage()

    await screen.findByText('Algebra Quiz')

    act(() => {
      vi.advanceTimersByTime(61_000)
    })

    expect(screen.getByText(/time is up/i)).toBeInTheDocument()
    expect(screen.getByText(/over time/i)).toBeInTheDocument()

    vi.useRealTimers()
  })

  // --- Answering questions ---

  it('allows selecting an MCQ option', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()

    await screen.findByText('Algebra Quiz')

    const optionB = screen.getByLabelText('Question 1 option B')
    await user.click(optionB)

    expect(optionB).toHaveAttribute('aria-pressed', 'true')
  })

  it('allows selecting a boolean sub-question option', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MIXED })
    getSubmissionMock.mockResolvedValue({ data: { ...SUBMISSION, mode: 'untimed' } })

    renderPage('2')

    await screen.findByText('Mixed Quiz')

    const trueOptionA = screen.getByLabelText('Question 2 sub a True')
    await user.click(trueOptionA)

    expect(trueOptionA).toHaveAttribute('aria-pressed', 'true')
  })

  it('allows entering a numeric answer', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MIXED })
    getSubmissionMock.mockResolvedValue({ data: { ...SUBMISSION, exercise_id: 2, mode: 'untimed' } })

    renderPage('2')

    await screen.findByText('Mixed Quiz')

    const numInput = screen.getByLabelText('Question 3 numeric answer')
    await user.type(numInput, '42')

    expect(numInput).toHaveValue(42)
  })

  // --- Submit flow ---

  it('shows confirm dialog when submit button is clicked', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/cannot change your answers/i)).toBeInTheDocument()
  })

  it('hides confirm dialog when cancel is clicked', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('calls submitAnswers with correct payload including sub_id for boolean', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MIXED })
    getSubmissionMock.mockResolvedValue({ data: { ...SUBMISSION, exercise_id: 2, mode: 'untimed', total_questions: 3 } })
    submitAnswersMock.mockResolvedValue({
      data: {
        id: 10,
        submitted_at: '2026-03-15 10:05:00',
        answers: [
          { id: 1, q_id: 1, sub_id: null, submitted_answer: 'B', is_correct: null },
          { id: 2, q_id: 2, sub_id: 'a', submitted_answer: '1', is_correct: null },
          { id: 3, q_id: 2, sub_id: 'b', submitted_answer: null, is_correct: null },
          { id: 4, q_id: 2, sub_id: 'c', submitted_answer: null, is_correct: null },
          { id: 5, q_id: 2, sub_id: 'd', submitted_answer: null, is_correct: null },
          { id: 6, q_id: 3, sub_id: null, submitted_answer: null, is_correct: null },
        ],
      },
    })

    renderPage('2')

    await screen.findByText('Mixed Quiz')

    await user.click(screen.getByLabelText('Question 1 option B'))
    await user.click(screen.getByLabelText('Question 2 sub a True'))

    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await user.click(screen.getByRole('button', { name: /yes, submit/i }))

    expect(submitAnswersMock).toHaveBeenCalledWith('test-token', 10, expect.arrayContaining([
      { q_id: 1, submitted_answer: 'B' },
      { q_id: 2, sub_id: 'a', submitted_answer: '1' },
      { q_id: 2, sub_id: 'b', submitted_answer: null },
      { q_id: 2, sub_id: 'c', submitted_answer: null },
      { q_id: 2, sub_id: 'd', submitted_answer: null },
      { q_id: 3, submitted_answer: null },
    ]))
  })

  it('shows submitted view with read-only answer table after success', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    submitAnswersMock.mockResolvedValue({
      data: {
        id: 10,
        submitted_at: '2026-03-15 10:05:00',
        answers: [
          { id: 1, q_id: 1, sub_id: null, submitted_answer: 'B', is_correct: null },
          { id: 2, q_id: 2, sub_id: null, submitted_answer: 'A', is_correct: null },
        ],
      },
    })

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByLabelText('Question 1 option B'))
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await user.click(screen.getByRole('button', { name: /yes, submit/i }))

    expect(await screen.findByText(/submitted!/i)).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('question inputs are gone after submission (submitted view shows table)', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    submitAnswersMock.mockResolvedValue({
      data: {
        id: 10,
        submitted_at: '2026-03-15 10:05:00',
        answers: [
          { id: 1, q_id: 1, sub_id: null, submitted_answer: null, is_correct: null },
          { id: 2, q_id: 2, sub_id: null, submitted_answer: null, is_correct: null },
        ],
      },
    })

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await user.click(screen.getByRole('button', { name: /yes, submit/i }))

    await screen.findByText(/submitted!/i)

    expect(screen.queryByLabelText('Question 1 option A')).not.toBeInTheDocument()
  })

  it('shows submit error when submitAnswers API fails', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    submitAnswersMock.mockRejectedValue(new Error('Submission already exists'))

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await user.click(screen.getByRole('button', { name: /yes, submit/i }))

    expect(await screen.findByText(/submission already exists/i)).toBeInTheDocument()
  })

  it('shows dash for unanswered questions in submitted view', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    submitAnswersMock.mockResolvedValue({
      data: {
        id: 10,
        submitted_at: '2026-03-15 10:05:00',
        answers: [
          { id: 1, q_id: 1, sub_id: null, submitted_answer: null, is_correct: null },
          { id: 2, q_id: 2, sub_id: null, submitted_answer: null, is_correct: null },
        ],
      },
    })

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await user.click(screen.getByRole('button', { name: /yes, submit/i }))

    await screen.findByText(/submitted!/i)

    const dashes = screen.getAllByText('—')
    expect(dashes).toHaveLength(2)
  })

  // --- Navigation guard ---

  it('registers a beforeunload listener while exercise is in progress', async () => {
    const addEventSpy = vi.spyOn(window, 'addEventListener')
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()

    await screen.findByText('Algebra Quiz')

    const calls = addEventSpy.mock.calls.filter(([event]) => event === 'beforeunload')
    expect(calls.length).toBeGreaterThan(0)

    addEventSpy.mockRestore()
  })

  it('removes the beforeunload listener after submission', async () => {
    const user = userEvent.setup()
    const removeEventSpy = vi.spyOn(window, 'removeEventListener')
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    submitAnswersMock.mockResolvedValue({
      data: {
        id: 10,
        submitted_at: '2026-03-15 10:05:00',
        answers: [
          { id: 1, q_id: 1, sub_id: null, submitted_answer: null, is_correct: null },
          { id: 2, q_id: 2, sub_id: null, submitted_answer: null, is_correct: null },
        ],
      },
    })

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await user.click(screen.getByRole('button', { name: /yes, submit/i }))
    await screen.findByText(/submitted!/i)

    const calls = removeEventSpy.mock.calls.filter(([event]) => event === 'beforeunload')
    expect(calls.length).toBeGreaterThan(0)

    removeEventSpy.mockRestore()
  })

  it('shows Back button as a warning prompt instead of a plain link while in progress', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()

    await screen.findByText('Algebra Quiz')

    expect(screen.getByRole('button', { name: /^Back$/i })).toBeInTheDocument()
  })

  it('shows an in-page leave warning when Back button is clicked mid-exercise', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Back$/i }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/leave this exercise/i)).toBeInTheDocument()
    expect(screen.getByText(/your answers will be lost/i)).toBeInTheDocument()
  })

  it('navigates away when user confirms leave', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Back$/i }))
    await user.click(screen.getByRole('button', { name: /yes, leave/i }))

    expect(await screen.findByText('Exercises list')).toBeInTheDocument()
  })

  it('dismisses leave warning when user cancels', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Back$/i }))
    await user.click(screen.getByRole('button', { name: /stay/i }))

    expect(screen.queryByRole('dialog', { name: /leave exercise/i })).not.toBeInTheDocument()
    expect(screen.getByText('Algebra Quiz')).toBeInTheDocument()
  })

  it('Back button is disabled while submission is in flight', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    submitAnswersMock.mockImplementation(() => new Promise(() => {}))

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await user.click(screen.getByRole('button', { name: /yes, submit/i }))

    const backButton = screen.getByRole('button', { name: /^Back$/i })
    expect(backButton).toBeDisabled()
  })

  it('Back button is a plain link (no warning) after exercise is submitted', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    submitAnswersMock.mockResolvedValue({
      data: {
        id: 10,
        submitted_at: '2026-03-15 10:05:00',
        answers: [
          { id: 1, q_id: 1, sub_id: null, submitted_answer: null, is_correct: null },
          { id: 2, q_id: 2, sub_id: null, submitted_answer: null, is_correct: null },
        ],
      },
    })

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await user.click(screen.getByRole('button', { name: /yes, submit/i }))
    await screen.findByText(/submitted!/i)

    expect(screen.getByRole('link', { name: /back to exercises/i })).toBeInTheDocument()
  })

  // --- Score and correctness display ---

  it('shows score in submitted view when API returns a score', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    submitAnswersMock.mockResolvedValue({
      data: {
        id: 10,
        score: 7.5,
        submitted_at: '2026-03-15 10:05:00',
        answers: [
          { id: 1, q_id: 1, sub_id: null, submitted_answer: 'B', is_correct: 1 },
          { id: 2, q_id: 2, sub_id: null, submitted_answer: 'A', is_correct: 0 },
        ],
      },
    })

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await user.click(screen.getByRole('button', { name: /yes, submit/i }))

    await screen.findByText(/submitted!/i)
    expect(screen.getByText('7.5')).toBeInTheDocument()
    expect(screen.getByText('/ 10')).toBeInTheDocument()
  })

  it('shows correctness indicator (✓) for correct answers in submitted view', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    submitAnswersMock.mockResolvedValue({
      data: {
        id: 10,
        score: 10,
        submitted_at: '2026-03-15 10:05:00',
        answers: [
          { id: 1, q_id: 1, sub_id: null, submitted_answer: 'B', is_correct: 1 },
          { id: 2, q_id: 2, sub_id: null, submitted_answer: 'C', is_correct: 1 },
        ],
      },
    })

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await user.click(screen.getByRole('button', { name: /yes, submit/i }))

    await screen.findByText(/submitted!/i)
    const correct = screen.getAllByLabelText('correct')
    expect(correct.length).toBeGreaterThan(0)
  })

  it('shows correctness indicator (✗) for wrong answers in submitted view', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    submitAnswersMock.mockResolvedValue({
      data: {
        id: 10,
        score: 0,
        submitted_at: '2026-03-15 10:05:00',
        answers: [
          { id: 1, q_id: 1, sub_id: null, submitted_answer: 'A', is_correct: 0 },
          { id: 2, q_id: 2, sub_id: null, submitted_answer: 'D', is_correct: 0 },
        ],
      },
    })

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await user.click(screen.getByRole('button', { name: /yes, submit/i }))

    await screen.findByText(/submitted!/i)
    const wrong = screen.getAllByLabelText('wrong')
    expect(wrong.length).toBeGreaterThan(0)
  })

  it('shows no score badge when score is null (legacy submissions)', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    submitAnswersMock.mockResolvedValue({
      data: {
        id: 10,
        score: null,
        submitted_at: '2026-03-15 10:05:00',
        answers: [
          { id: 1, q_id: 1, sub_id: null, submitted_answer: null, is_correct: null },
          { id: 2, q_id: 2, sub_id: null, submitted_answer: null, is_correct: null },
        ],
      },
    })

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await user.click(screen.getByRole('button', { name: /yes, submit/i }))

    await screen.findByText(/submitted!/i)
    expect(screen.queryByText(/\/\s*10/)).not.toBeInTheDocument()
  })

  // ── Image extraction (v0.4) ────────────────────────────────────────────────

  describe('Image extraction (v0.4)', () => {
    beforeEach(() => {
      toastMock.success.mockReset()
      toastMock.warning.mockReset()
    })

    it('renders the input mode toggle and defaults to manual', async () => {
      getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
      getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

      renderPage()
      await screen.findByText('Algebra Quiz')

      const manualBtn = screen.getByRole('button', { name: /^Manual$/i })
      const photoBtn = screen.getByRole('button', { name: /Upload photo/i })
      expect(manualBtn).toHaveAttribute('aria-pressed', 'true')
      expect(photoBtn).toHaveAttribute('aria-pressed', 'false')
      // Upload component is hidden by default
      expect(screen.queryByTestId('stub-extract-fire')).not.toBeInTheDocument()
    })

    it('shows the upload panel when switching to photo mode', async () => {
      const user = userEvent.setup()
      getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
      getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

      renderPage()
      await screen.findByText('Algebra Quiz')

      await user.click(screen.getByRole('button', { name: /Upload photo/i }))
      expect(screen.getByTestId('stub-extract-fire')).toBeInTheDocument()
    })

    it('merges extracted answers into the form and shows confidence dots', async () => {
      const user = userEvent.setup()
      getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
      getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

      renderPage()
      await screen.findByText('Algebra Quiz')

      await user.click(screen.getByRole('button', { name: /Upload photo/i }))
      await user.click(screen.getByTestId('stub-extract-fire'))

      // Q1 → B selected (high confidence dot)
      const q1B = screen.getByRole('button', { name: 'Question 1 option B' })
      expect(q1B).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByLabelText(/high confidence/i)).toBeInTheDocument()

      // Q2 → C selected (low confidence dot — 0.4)
      const q2C = screen.getByRole('button', { name: 'Question 2 option C' })
      expect(q2C).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByLabelText(/low confidence/i)).toBeInTheDocument()

      // Toast notified the student
      expect(toastMock.success).toHaveBeenCalled()
    })

    it('clears the confidence dot on a cell after the student edits it manually', async () => {
      const user = userEvent.setup()
      getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
      getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

      renderPage()
      await screen.findByText('Algebra Quiz')

      await user.click(screen.getByRole('button', { name: /Upload photo/i }))
      await user.click(screen.getByTestId('stub-extract-fire'))

      // Q1 starts with the high-confidence dot (Q2 also has a low-conf dot)
      expect(screen.getByLabelText(/high confidence/i)).toBeInTheDocument()

      // Student manually picks A for Q1 — the high-confidence dot disappears
      await user.click(screen.getByRole('button', { name: 'Question 1 option A' }))
      expect(screen.queryByLabelText(/high confidence/i)).not.toBeInTheDocument()

      // Q2 still has its low-confidence dot
      expect(screen.getByLabelText(/low confidence/i)).toBeInTheDocument()
    })
  })
})
