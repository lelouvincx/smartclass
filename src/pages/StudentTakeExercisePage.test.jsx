import React from 'react'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import StudentTakeExercisePage from './StudentTakeExercisePage'
import { setSubmissionPointer, submissionDraftKey } from '../lib/submission-draft'

// --- Mocks ---

const getExerciseMock = vi.fn()
const createSubmissionMock = vi.fn()
const getSubmissionMock = vi.fn()
const getSubmissionExercisePdfMock = vi.fn()
const submitAnswersMock = vi.fn()
const getQuestionAssetBlobMock = vi.fn()
let desktopViewport

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getExercise: (...args) => getExerciseMock(...args),
    createSubmission: (...args) => createSubmissionMock(...args),
    getSubmission: (...args) => getSubmissionMock(...args),
    getSubmissionExercisePdf: (...args) => getSubmissionExercisePdfMock(...args),
    submitAnswers: (...args) => submitAnswersMock(...args),
    getQuestionAssetBlob: (...args) => getQuestionAssetBlobMock(...args),
  }
})

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({
    token: 'test-token',
    user: { id: 7 },
  }),
}))

const toastMock = vi.hoisted(() => ({
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: toastMock }))

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
  question_asset_set_id: 5,
  question_assets: [
    { id: 101, q_id: 1, segment_index: 0, file_url: '/api/question-assets/101', accessible_text: 'Algebra question one' },
    { id: 102, q_id: 2, segment_index: 0, file_url: '/api/question-assets/102', accessible_text: 'Algebra question two' },
  ],
}

// --- Render helper ---

function renderPage(exerciseId = '1') {
  setSubmissionPointer(7, exerciseId, '10')
  return render(
    <MemoryRouter initialEntries={[`/student/exercises/${exerciseId}/take`]}>
      <Routes>
        <Route path="/student/exercises/:id/take" element={<StudentTakeExercisePage />} />
        <Route path="/student/exercises/:id" element={<div>Exercise landing</div>} />
        <Route path="/student/exercises" element={<div>Exercises list</div>} />
        <Route path="/student/submissions/:id/summary" element={<div>Summary page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

// --- Tests ---

describe('StudentTakeExercisePage', () => {
  beforeEach(() => {
    desktopViewport = true
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: ['(min-width: 1280px)', '(min-width: 768px)'].includes(query)
        ? desktopViewport
        : false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    getExerciseMock.mockReset()
    createSubmissionMock.mockReset()
    getSubmissionMock.mockReset()
    getSubmissionExercisePdfMock.mockReset()
    getSubmissionExercisePdfMock.mockResolvedValue(new Blob(['exercise'], { type: 'application/pdf' }))
    submitAnswersMock.mockReset()
    getQuestionAssetBlobMock.mockReset()
    getQuestionAssetBlobMock.mockResolvedValue(new Blob(['question'], { type: 'image/webp' }))
    global.URL.createObjectURL = vi.fn((blob) => `blob:question-${blob.size}-${Math.random()}`)
    global.URL.revokeObjectURL = vi.fn()
    sessionStorage.clear()
    localStorage.clear()
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

  // --- Single-question view (clicking nav cell shows that question) ---

  it('renders only the selected question, not the full list', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()
    await screen.findByText('Algebra Quiz')

    // Default = first question. Q1 visible, Q2 not.
    expect(screen.getByText(/^1\. Question 1$/)).toBeInTheDocument()
    expect(screen.queryByText(/^2\. Question 2$/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Question 2 option A')).not.toBeInTheDocument()
  })

  it('shows the clicked question after clicking a nav grid cell', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()
    await screen.findByText('Algebra Quiz')

    await user.click(screen.getByRole('button', { name: /jump to question 2/i }))

    expect(screen.getByText(/^2\. Question 2$/)).toBeInTheDocument()
    expect(screen.getByLabelText('Question 2 option A')).toBeInTheDocument()
    expect(await screen.findByAltText('Algebra question two')).toBeInTheDocument()
    expect(screen.queryByAltText('Algebra question one')).not.toBeInTheDocument()
    // Q1 no longer in DOM
    expect(screen.queryByText(/^1\. Question 1$/)).not.toBeInTheDocument()
  })

  it('shows section titles and restarted local numbers while keeping global navigation order', async () => {
    const user = userEvent.setup()
    const sectionedExercise = {
      ...EXERCISE_MCQ,
      schema: [
        { q_id: 1, section_key: 'section-1', section_title: 'Phần I', local_number: 1, type: 'mcq', sub_id: null },
        { q_id: 2, section_key: 'section-2', section_title: 'Phần II', local_number: 1, type: 'mcq', sub_id: null },
      ],
    }
    getExerciseMock.mockResolvedValue({ data: sectionedExercise })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()
    await screen.findByText('Algebra Quiz')

    expect(screen.getByRole('heading', { name: 'Phần I · Question 1' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Jump to Phần II, question 1' }))
    expect(screen.getByRole('heading', { name: 'Phần II · Question 1' })).toBeInTheDocument()
    expect(screen.getByLabelText('Question Phần II, 1 option A')).toBeInTheDocument()
  })

  it('uses one compact answer-sheet drawer on mobile and closes it after a question jump', async () => {
    const user = userEvent.setup()
    desktopViewport = false
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()
    await screen.findByText('Algebra Quiz')

    const openAnswerSheet = screen.getByRole('button', { name: /open answer sheet/i })
    expect(screen.queryByRole('button', { name: /jump to question 2/i })).not.toBeInTheDocument()

    await user.click(openAnswerSheet)

    expect(screen.getAllByRole('button', { name: /^submit$/i })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: /jump to question 2/i }))

    const questionHeading = await screen.findByText(/^2\. Question 2$/)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(questionHeading).toHaveFocus()
    expect(screen.getByTestId('take-question-image')).toContainElement(
      await screen.findByAltText('Algebra question two'),
    )
  })

  it('shows the question image between the answer sheet and answer choices while keeping PDF download on mobile', async () => {
    const user = userEvent.setup()
    desktopViewport = false
    let downloadedFileName = ''
    const downloadClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      downloadedFileName = this.download
    })
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()
    await screen.findByText('Algebra Quiz')

    const answerSheet = screen.getByRole('button', { name: /open answer sheet/i })
    const questionImage = await screen.findByAltText('Algebra question one')
    const answerChoice = screen.getByLabelText('Question 1 option A')

    expect(answerSheet.compareDocumentPosition(questionImage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(questionImage.compareDocumentPosition(answerChoice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(getSubmissionExercisePdfMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Download full exercise PDF' }))

    await waitFor(() => {
      expect(getSubmissionExercisePdfMock).toHaveBeenCalledWith('test-token', 10)
    })
    expect(downloadedFileName).toBe('exercise-1.pdf')
    downloadClick.mockRestore()
  })

  it('uses the in-progress submission pinned schema and assets after the exercise changes', async () => {
    getExerciseMock.mockResolvedValue({
      data: {
        ...EXERCISE_MCQ,
        schema: [{ q_id: 99, type: 'numeric', sub_id: null }],
        question_assets: [{ id: 999, q_id: 99, segment_index: 0, file_url: '/api/question-assets/999' }],
      },
    })
    getSubmissionMock.mockResolvedValue({
      data: {
        ...SUBMISSION,
        total_questions: 1,
        answers: [
          { q_id: 7, sub_id: null, type: 'mcq', submitted_answer: null, is_correct: 0 },
        ],
        question_assets: [
          { id: 107, q_id: 7, segment_index: 0, file_url: '/api/question-assets/107', accessible_text: 'Pinned question seven' },
        ],
      },
    })

    renderPage()

    expect(await screen.findByText(/^1\. Question 7$/)).toBeInTheDocument()
    expect(screen.getByLabelText('Question 7 option A')).toBeInTheDocument()
    expect(await screen.findByAltText('Pinned question seven')).toBeInTheDocument()
    expect(screen.queryByLabelText('Question 99 numeric answer')).not.toBeInTheDocument()
    expect(getQuestionAssetBlobMock).not.toHaveBeenCalledWith('test-token', '/api/question-assets/999')
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
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MIXED })
    getSubmissionMock.mockResolvedValue({ data: { ...SUBMISSION, exercise_id: 2, mode: 'untimed' } })

    renderPage('2')

    await screen.findByText('Mixed Quiz')

    // Q2 is the boolean question — navigate to it via the nav grid
    await user.click(screen.getByRole('button', { name: /jump to question 2/i }))

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
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MIXED })
    getSubmissionMock.mockResolvedValue({ data: { ...SUBMISSION, exercise_id: 2, mode: 'untimed' } })

    renderPage('2')

    await screen.findByText('Mixed Quiz')

    await user.click(screen.getByRole('button', { name: /jump to question 3/i }))

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
    // "Over time" badge appears in the always-visible sidebar timer.
    expect(screen.getAllByText(/over time/i).length).toBeGreaterThan(0)

    vi.useRealTimers()
  })

  // --- Question-first workspace ---

  it('does not render the source PDF or a full-PDF control', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()
    await screen.findByText('Algebra Quiz')

    expect(document.querySelector('iframe')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /show pdf|hide pdf/i })).not.toBeInTheDocument()
    expect(await screen.findByAltText('Algebra question one')).toBeInTheDocument()
  })

  it('keeps the question image before its matching answer controls in document order', async () => {
    const now = new Date()
    const startedAt = now.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')
    const sub = { ...SUBMISSION, started_at: startedAt }

    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: sub })

    renderPage()
    await screen.findByText('Algebra Quiz')

    const questionImage = await screen.findByAltText('Algebra question one')
    const answer = screen.getByLabelText('Question 1 option A')

    expect(questionImage.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('orders the desktop answer sheet, current answer controls, and submission actions', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()
    await screen.findByText('Algebra Quiz')

    const answerSheet = screen.getByText('Answer Sheet')
    const answer = screen.getByLabelText('Question 1 option A')
    const submit = screen.getByRole('button', { name: 'Submit' })
    const exit = screen.getByRole('button', { name: 'Exit' })

    expect(answerSheet.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(answer.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(answer.compareDocumentPosition(exit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(exit).toHaveAttribute('data-variant', 'destructive')
  })

  it('keeps only manual answer controls in the current answer card', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()
    await screen.findByText('Algebra Quiz')

    const answerCard = screen.getByRole('heading', { name: 'Your Answer' }).closest('[data-slot="card"]')

    expect(answerCard).toContainElement(screen.getByLabelText('Question 1 option A'))
    expect(screen.queryByTestId('take-input-mode')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Manual$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Upload photo/i })).not.toBeInTheDocument()
  })

  it('puts the isolated question and matching controls in one stable two-column workspace', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()
    await screen.findByText('Algebra Quiz')

    expect(screen.getByTestId('take-question-workspace')).toHaveClass('xl:grid-cols-[minmax(0,1fr)_18rem]')
    expect(screen.getByTestId('take-question-image')).toContainElement(await screen.findByAltText('Algebra question one'))
    expect(screen.getByTestId('take-answer-controls')).toContainElement(screen.getByLabelText('Question 1 option A'))
  })

  it('reveals and focuses the selected question when a numbered question is clicked', async () => {
    const user = userEvent.setup()
    const scrollSpy = vi.fn()
    Element.prototype.scrollIntoView = scrollSpy
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()
    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /jump to question 2/i }))

    const heading = screen.getByRole('heading', { name: '2. Question 2' })
    expect(heading).toHaveFocus()
    expect(scrollSpy).toHaveBeenCalledWith({ block: 'start' })
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

  it('restores answers after leaving and refreshing the same in-progress attempt', async () => {
    sessionStorage.setItem(submissionDraftKey(7, 10), JSON.stringify({
      version: 1,
      accountId: '7',
      submissionId: '10',
      answers: { 1: 'B', 999: 'A' },
      extractedConfidence: { '1:': 0.9, '999:': 1 },
    }))
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    renderPage()

    await screen.findByText('Algebra Quiz')
    expect(screen.getByLabelText('Question 1 option B')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByLabelText(/high confidence/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Question 999 option A')).not.toBeInTheDocument()
  })

  it('allows selecting a boolean sub-question option', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MIXED })
    getSubmissionMock.mockResolvedValue({ data: { ...SUBMISSION, mode: 'untimed' } })

    renderPage('2')

    await screen.findByText('Mixed Quiz')

    await user.click(screen.getByRole('button', { name: /jump to question 2/i }))

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

    await user.click(screen.getByRole('button', { name: /jump to question 3/i }))

    const numInput = screen.getByLabelText('Question 3 numeric answer')
    await user.type(numInput, '42')

    expect(numInput).toHaveValue(42)
  })

  // --- Submit flow ---

  it('shows confirm dialog with unanswered count when submit button is clicked', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/you have 2 unanswered questions/i)).toBeInTheDocument()
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

    // Q1 = mcq (default view); pick B
    await user.click(screen.getByLabelText('Question 1 option B'))

    // Navigate to Q2 (boolean), pick sub a True
    await user.click(screen.getByRole('button', { name: /jump to question 2/i }))
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

  it('navigates to summary page after successful submit', async () => {
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
          { id: 2, q_id: 2, sub_id: null, submitted_answer: null, is_correct: 0 },
        ],
      },
    })

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await user.click(screen.getByRole('button', { name: /yes, submit/i }))

    expect(await screen.findByText('Summary page')).toBeInTheDocument()
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

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/submission already exists/i)
    const submit = screen.getByRole('button', { name: /^Submit$/i })
    expect(alert.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('recovers when submission succeeds but the submit response is lost', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock
      .mockResolvedValueOnce({ data: SUBMISSION })
      .mockResolvedValueOnce({ data: { ...SUBMISSION, submitted_at: '2026-03-15 10:05:00' } })
    submitAnswersMock.mockRejectedValue(new Error('Connection lost'))

    renderPage()
    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await user.click(screen.getByRole('button', { name: /yes, submit/i }))

    expect(await screen.findByText('Summary page')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the timer running after a rejected submit and clears the error on retry', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const startedAt = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: { ...SUBMISSION, started_at: startedAt } })
    submitAnswersMock.mockRejectedValueOnce(new Error('Try again')).mockImplementation(() => new Promise(() => {}))
    renderPage()
    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await user.click(screen.getByRole('button', { name: /yes, submit/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again')

    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByLabelText('Timer')).toHaveTextContent('29:58')
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    vi.useRealTimers()
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
        answers: [],
      },
    })

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await user.click(screen.getByRole('button', { name: /yes, submit/i }))
    await screen.findByText('Summary page')

    const calls = removeEventSpy.mock.calls.filter(([event]) => event === 'beforeunload')
    expect(calls.length).toBeGreaterThan(0)

    removeEventSpy.mockRestore()
  })

  it('shows Exit button as a warning prompt instead of a plain link while in progress', async () => {
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()

    await screen.findByText('Algebra Quiz')

    expect(screen.getByRole('button', { name: /^Exit$/i })).toBeInTheDocument()
  })

  it('shows an in-page leave warning when Exit button is clicked mid-exercise', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Exit$/i }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/leave this exercise/i)).toBeInTheDocument()
    expect(screen.getByText(/answers remain saved for this browser session/i)).toBeInTheDocument()
  })

  it('navigates away when user confirms leave', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Exit$/i }))
    await user.click(screen.getByRole('button', { name: /yes, leave/i }))

    expect(await screen.findByText('Exercises list')).toBeInTheDocument()
  })

  it('dismisses leave warning when user cancels', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Exit$/i }))
    await user.click(screen.getByRole('button', { name: /stay/i }))

    expect(screen.queryByRole('dialog', { name: /leave exercise/i })).not.toBeInTheDocument()
    expect(screen.getByText('Algebra Quiz')).toBeInTheDocument()
  })

  it('Exit button is disabled while submission is in flight', async () => {
    const user = userEvent.setup()
    getExerciseMock.mockResolvedValue({ data: EXERCISE_MCQ })
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    submitAnswersMock.mockImplementation(() => new Promise(() => {}))

    renderPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /^Submit$/i }))
    await user.click(screen.getByRole('button', { name: /yes, submit/i }))

    const exitButton = screen.getByRole('button', { name: /^Exit$/i })
    expect(exitButton).toBeDisabled()
  })

})
