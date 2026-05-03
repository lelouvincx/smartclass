import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import StudentReviewPage from './StudentReviewPage'

const getSubmissionMock = vi.fn()
const getFileUrlMock = vi.fn((id) => `/api/files/${id}`)

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getSubmission: (...args) => getSubmissionMock(...args),
    getFileUrl: (...args) => getFileUrlMock(...args),
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
    getFileUrlMock.mockReset()
    getFileUrlMock.mockImplementation((id) => `/api/files/${id}`)
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

  it('renders an iframe for the exercise PDF', async () => {
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    renderReviewPage()

    await screen.findByText('Algebra Quiz')
    const iframe = screen.getByTitle('Exercise PDF')
    expect(iframe).toHaveAttribute('src', '/api/files/3')
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
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION })
    renderReviewPage()

    await screen.findByText('Algebra Quiz')
    // Q2c has submitted_answer=null → should render "—"
    // Multiple "—" may appear, just check at least one
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('renders without PDF pane when no exercise_pdf file', async () => {
    const subWithoutPdf = {
      ...SUBMISSION,
      files: [],
    }
    getSubmissionMock.mockResolvedValue({ data: subWithoutPdf })
    renderReviewPage()

    await screen.findByText('Algebra Quiz')
    expect(screen.queryByTitle('Exercise PDF')).not.toBeInTheDocument()
  })

  it('shows error state when API call fails', async () => {
    getSubmissionMock.mockRejectedValue(new Error('Network error'))
    renderReviewPage()

    expect(await screen.findByText(/network error/i)).toBeInTheDocument()
  })
})
