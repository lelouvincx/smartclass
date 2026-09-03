import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import StudentReviewPage from './StudentReviewPage'

const getSubmissionMock = vi.fn()
const getQuestionAssetBlobMock = vi.fn()

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getSubmission: (...args) => getSubmissionMock(...args),
    getQuestionAssetBlob: (...args) => getQuestionAssetBlobMock(...args),
  }
})

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

// Full submission fixture: MCQ + boolean + numeric, all submitted
const SUBMISSION = {
  id: 5,
  exercise_id: 2,
  exercise_title: 'Algebra Quiz',
  mode: 'timed',
  score: 7.5,
  total_questions: 3,
  started_at: '2026-03-16T10:00:00',
  submitted_at: '2026-03-16T10:25:00',
  files: [
    { id: 3, file_type: 'exercise_pdf', file_name: 'quiz.pdf' },
  ],
  question_asset_set_id: 8,
  question_assets: [
    { id: 101, q_id: 1, segment_index: 0, file_url: '/api/question-assets/101', accessible_text: 'Review question one' },
    { id: 202, q_id: 2, segment_index: 1, file_url: '/api/question-assets/202', accessible_text: 'Review question two continuation' },
    { id: 201, q_id: 2, segment_index: 0, file_url: '/api/question-assets/201', accessible_text: 'Review question two start' },
    { id: 301, q_id: 3, segment_index: 0, file_url: '/api/question-assets/301', accessible_text: 'Review question three' },
  ],
  answers: [
    { q_id: 1, sub_id: null, type: 'mcq', submitted_answer: 'A', correct_answer: 'B', is_correct: 0 },
    { q_id: 2, sub_id: 'a', type: 'boolean', submitted_answer: '1', correct_answer: '1', is_correct: 1 },
    { q_id: 2, sub_id: 'b', type: 'boolean', submitted_answer: '0', correct_answer: '0', is_correct: 1 },
    { q_id: 2, sub_id: 'c', type: 'boolean', submitted_answer: null, correct_answer: '0', is_correct: 0 },
    { q_id: 2, sub_id: 'd', type: 'boolean', submitted_answer: '1', correct_answer: '1', is_correct: 1 },
    { q_id: 3, sub_id: null, type: 'numeric', submitted_answer: '42', correct_answer: '42', is_correct: 1 },
  ],
}

function renderReviewPage(submissionId = '5') {
  return render(
    <MemoryRouter initialEntries={[`/student/submissions/${submissionId}/review`]}>
      <Routes>
        <Route path="/student/submissions/:id/review" element={<StudentReviewPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('StudentReviewPage', () => {
  beforeEach(() => {
    getSubmissionMock.mockReset()
    getQuestionAssetBlobMock.mockReset()
    getQuestionAssetBlobMock.mockResolvedValue(new Blob(['question'], { type: 'image/webp' }))
    global.URL.createObjectURL = vi.fn((blob) => `blob:review-${blob.size}-${Math.random()}`)
    global.URL.revokeObjectURL = vi.fn()
  })

  it('shows loading state initially', () => {
    getSubmissionMock.mockReturnValue(new Promise(() => {}))
    renderReviewPage()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders exercise title and score', async () => {
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    renderReviewPage()

    expect(await screen.findByText('Algebra Quiz')).toBeInTheDocument()
    expect(screen.getAllByText(/7\.5/).length).toBeGreaterThan(0)
  })

  it('shows the pinned question image without rendering the exercise PDF', async () => {
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    renderReviewPage()

    await screen.findByText('Algebra Quiz')
    expect(await screen.findByAltText('Review question one')).toBeInTheDocument()
    expect(document.querySelector('iframe')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /show pdf|hide pdf/i })).not.toBeInTheDocument()
  })

  it('shows correct_answer for each question', async () => {
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    renderReviewPage()

    await screen.findByText('Algebra Quiz')
    // MCQ Q1: student answered A, correct is B — may appear in table + sidebar
    expect(screen.getAllByText('A').length).toBeGreaterThan(0)
    expect(screen.getAllByText('B').length).toBeGreaterThan(0)
    // Numeric Q3: both student and correct are 42
    expect(screen.getAllByText('42').length).toBeGreaterThan(0)
  })

  it('shows ✓ for correct answers and ✗ for wrong answers', async () => {
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    renderReviewPage()

    await screen.findByText('Algebra Quiz')
    expect(screen.getAllByLabelText('correct').length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText('wrong').length).toBeGreaterThan(0)
  })

  it('shows — for skipped (null) boolean sub-answer', async () => {
    const user = userEvent.setup()
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    renderReviewPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /review question 2/i }))
    // Q2c has submitted_answer=null → should render "—"
    // Multiple "—" may appear, just check at least one
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('renders from pinned assets even when no exercise_pdf file is returned', async () => {
    const subWithoutPdf = {
      ...SUBMISSION,
      files: [],
    }
    getSubmissionMock.mockResolvedValue({ data: subWithoutPdf })
    renderReviewPage()

    await screen.findByText('Algebra Quiz')
    expect(await screen.findByAltText('Review question one')).toBeInTheDocument()
  })

  it('shows error state when API call fails', async () => {
    getSubmissionMock.mockRejectedValue(new Error('Network error'))
    renderReviewPage()

    expect(await screen.findByText(/network error/i)).toBeInTheDocument()
  })

  it('changes the isolated image and result together from question navigation', async () => {
    const user = userEvent.setup()
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    renderReviewPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /review question 3/i }))

    expect(await screen.findByAltText('Review question three')).toBeInTheDocument()
    expect(screen.queryByAltText('Review question one')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Question 3' })).toBeInTheDocument()
    expect(screen.getAllByText('42').length).toBeGreaterThan(0)
    expect(screen.queryByText('B')).not.toBeInTheDocument()
  })

  it('renders multi-segment questions in order', async () => {
    const user = userEvent.setup()
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    renderReviewPage()

    await screen.findByText('Algebra Quiz')
    await user.click(screen.getByRole('button', { name: /review question 2/i }))

    const images = await screen.findAllByRole('img')
    expect(images.map((image) => image.getAttribute('alt'))).toEqual([
      'Review question two start',
      'Review question two continuation',
    ])
  })
})
