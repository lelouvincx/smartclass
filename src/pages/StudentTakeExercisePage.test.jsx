import React from 'react'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import StudentTakeExercisePage from './StudentTakeExercisePage'

// --- Mocks ---

const getExerciseMock = vi.fn()
const createSubmissionMock = vi.fn()
const submitAnswersMock = vi.fn()

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getExercise: (...args) => getExerciseMock(...args),
    createSubmission: (...args) => createSubmissionMock(...args),
    submitAnswers: (...args) => submitAnswersMock(...args),
  }
})

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({
    token: 'test-token',
  }),
}))

// --- Fixtures ---

const EXERCISE_MCQ = {
  id: 1,
  title: 'Algebra Quiz',
  duration_minutes: 30,
  is_timed: 1,
  schema: [
    { q_id: 1, type: 'mcq' },
    { q_id: 2, type: 'mcq' },
  ],
}

const EXERCISE_MIXED = {
  id: 2,
  title: 'Mixed Quiz',
  duration_minutes: 0,
  is_timed: 0,
  schema: [
    { q_id: 1, type: 'mcq' },
    { q_id: 2, type: 'boolean' },
    { q_id: 3, type: 'numeric' },
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
  return render(
    <MemoryRouter initialEntries={[`/student/exercises/${exerciseId}`]}>
      <Routes>
        <Route path="/student/exercises/:id" element={<StudentTakeExercisePage />} />
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
    submitAnswersMock.mockReset()
  })

  // --- Loading and error states ---

  it('shows loading indicator while fetching', () => {
    getExerciseMock.mockImplementation(() => new Promise(() => {}))
    createSubmissionMock.mockImplementation(() => new Promise(() => {}))

    renderPage()

    expect(screen.getByText(/loading exercise/i)).toBeInTheDocument()
  })

  it('shows error message when exercise fetch fails', async () => {
    getExerciseMock.mockRejectedValue(new Error('Exercise not found'))
    createSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()

    expect(await screen.findByText(/exercise not found/i)).toBeInTheDocument()
  })

  it('shows error message when create submission fails', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    createSubmissionMock.mockRejectedValue(new Error('Already submitted'))

    renderPage()

    expect(await screen.findByText(/already submitted/i)).toBeInTheDocument()
  })

  // --- Exercise rendering ---

  it('renders exercise title and question count after loading', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    createSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()

    expect(await screen.findByText('Algebra Quiz')).toBeInTheDocument()
    expect(screen.getByText(/2 questions/i)).toBeInTheDocument()
  })

  it('renders MCQ radio buttons for mcq-type questions', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    createSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()

    await screen.findByText('Algebra Quiz')

    expect(screen.getByLabelText('Question 1 option A')).toBeInTheDocument()
    expect(screen.getByLabelText('Question 1 option B')).toBeInTheDocument()
    expect(screen.getByLabelText('Question 1 option C')).toBeInTheDocument()
    expect(screen.getByLabelText('Question 1 option D')).toBeInTheDocument()
  })

  it('renders True/False radio buttons for boolean-type questions', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MIXED })
    createSubmissionMock.mockResolvedValue({ data: { ...SUBMISSION, exercise_id: 2, mode: 'untimed' } })

    renderPage('2')

    await screen.findByText('Mixed Quiz')

    expect(screen.getByLabelText('Question 2 option True')).toBeInTheDocument()
    expect(screen.getByLabelText('Question 2 option False')).toBeInTheDocument()
  })

  it('renders numeric input for numeric-type questions', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MIXED })
    createSubmissionMock.mockResolvedValue({ data: { ...SUBMISSION, exercise_id: 2, mode: 'untimed' } })

    renderPage('2')

    await screen.findByText('Mixed Quiz')

    expect(screen.getByLabelText('Question 3 numeric answer')).toBeInTheDocument()
  })

  // --- Timer ---

  it('shows timer for timed exercise', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    createSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()

    await screen.findByText('Algebra Quiz')

    // 30 min = 30:00
    expect(screen.getByLabelText('Timer')).toHaveTextContent('30:00')
  })

  it('does not show timer for untimed exercise', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MIXED })
    createSubmissionMock.mockResolvedValue({ data: { ...SUBMISSION, mode: 'untimed' } })

    renderPage('2')

    await screen.findByText('Mixed Quiz')

    expect(screen.queryByLabelText('Timer')).not.toBeInTheDocument()
  })

  it('counts down the timer every second', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })

    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    createSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()

    await screen.findByText('Algebra Quiz')

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(screen.getByLabelText('Timer')).toHaveTextContent('29:55')

    vi.useRealTimers()
  })

  it('shows overtime warning and counts up when time expires', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })

    const shortExercise = { ...EXERCISE_MCQ, duration_minutes: 1 }
    getExerciseMock.mockResolvedValue({ data: shortExercise })
    createSubmissionMock.mockResolvedValue({ data: SUBMISSION })

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
    createSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()

    await screen.findByText('Algebra Quiz')

    const optionB = screen.getByLabelText('Question 1 option B')
    await user.click(optionB)

    expect(optionB).toBeChecked()
  })

  it('allows selecting a boolean option', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MIXED })
    createSubmissionMock.mockResolvedValue({ data: { ...SUBMISSION, mode: 'untimed' } })

    renderPage('2')

    await screen.findByText('Mixed Quiz')

    const trueOption = screen.getByLabelText('Question 2 option True')
    await user.click(trueOption)

    expect(trueOption).toBeChecked()
  })

  it('allows entering a numeric answer', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MIXED })
    createSubmissionMock.mockResolvedValue({ data: { ...SUBMISSION, mode: 'untimed' } })

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
    createSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/cannot change your answers/i)).toBeInTheDocument()
  })

  it('hides confirm dialog when cancel is clicked', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    createSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('calls submitAnswers with correct payload on confirm', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    createSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    submitAnswersMock.mockResolvedValue({
      data: {
        id: 10,
        submitted_at: '2026-03-15 10:05:00',
        answers: [
          { id: 1, q_id: 1, submitted_answer: 'B', is_correct: null },
          { id: 2, q_id: 2, submitted_answer: null, is_correct: null },
        ],
      },
    })

    renderPage()

    await screen.findByText('Algebra Quiz')

    await user.click(screen.getByLabelText('Question 1 option B'))
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await user.click(screen.getByRole('button', { name: /yes, submit/i }))

    expect(submitAnswersMock).toHaveBeenCalledWith('test-token', 10, [
      { q_id: 1, submitted_answer: 'B' },
      { q_id: 2, submitted_answer: null },
    ])
  })

  it('shows submitted view with read-only answer table after success', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    createSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    submitAnswersMock.mockResolvedValue({
      data: {
        id: 10,
        submitted_at: '2026-03-15 10:05:00',
        answers: [
          { id: 1, q_id: 1, submitted_answer: 'B', is_correct: null },
          { id: 2, q_id: 2, submitted_answer: 'A', is_correct: null },
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
    createSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    submitAnswersMock.mockResolvedValue({
      data: {
        id: 10,
        submitted_at: '2026-03-15 10:05:00',
        answers: [
          { id: 1, q_id: 1, submitted_answer: null, is_correct: null },
          { id: 2, q_id: 2, submitted_answer: null, is_correct: null },
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
    createSubmissionMock.mockResolvedValue({ data: SUBMISSION })
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
    createSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    submitAnswersMock.mockResolvedValue({
      data: {
        id: 10,
        submitted_at: '2026-03-15 10:05:00',
        answers: [
          { id: 1, q_id: 1, submitted_answer: null, is_correct: null },
          { id: 2, q_id: 2, submitted_answer: null, is_correct: null },
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
})
