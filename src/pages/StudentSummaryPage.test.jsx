import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import StudentSummaryPage from './StudentSummaryPage'

const getSubmissionMock = vi.fn()

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getSubmission: (...args) => getSubmissionMock(...args),
  }
})

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const SUBMISSION_MCQ = {
  id: 10,
  exercise_id: 1,
  exercise_title: 'Algebra Quiz',
  score: 7.5,
  started_at: '2026-03-15 10:00:00',
  submitted_at: '2026-03-15 10:05:00',
  answers: [
    { q_id: 1, sub_id: null, type: 'mcq', submitted_answer: 'B', is_correct: 1, correct_answer: 'B' },
    { q_id: 2, sub_id: null, type: 'mcq', submitted_answer: 'A', is_correct: 0, correct_answer: 'C' },
    { q_id: 3, sub_id: null, type: 'mcq', submitted_answer: null, is_correct: 0, correct_answer: 'D' },
  ],
}

const SUBMISSION_MIXED = {
  id: 11,
  exercise_id: 2,
  exercise_title: 'Mixed Quiz',
  score: 5.0,
  started_at: '2026-03-15 10:00:00',
  submitted_at: '2026-03-15 10:30:00',
  answers: [
    { q_id: 1, sub_id: null, type: 'mcq', submitted_answer: 'A', is_correct: 1, correct_answer: 'A' },
    { q_id: 2, sub_id: 'a', type: 'boolean', submitted_answer: '1', is_correct: 1, correct_answer: '1' },
    { q_id: 2, sub_id: 'b', type: 'boolean', submitted_answer: null, is_correct: 0, correct_answer: '0' },
    { q_id: 2, sub_id: 'c', type: 'boolean', submitted_answer: null, is_correct: 0, correct_answer: '1' },
    { q_id: 2, sub_id: 'd', type: 'boolean', submitted_answer: null, is_correct: 0, correct_answer: '0' },
    { q_id: 3, sub_id: null, type: 'numeric', submitted_answer: null, is_correct: 0, correct_answer: '42' },
  ],
}

function renderPage(id = '10') {
  return render(
    <MemoryRouter initialEntries={[`/student/submissions/${id}/summary`]}>
      <Routes>
        <Route path="/student/submissions/:id/summary" element={<StudentSummaryPage />} />
        <Route path="/student/submissions/:id/review" element={<div>Review page</div>} />
        <Route path="/student/exercises" element={<div>Exercises list</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('StudentSummaryPage', () => {
  beforeEach(() => {
    getSubmissionMock.mockReset()
  })

  it('shows loading indicator while fetching', () => {
    getSubmissionMock.mockImplementation(() => new Promise(() => {}))
    renderPage()
    expect(screen.getByText(/loading summary/i)).toBeInTheDocument()
  })

  it('shows error message when fetch fails', async () => {
    getSubmissionMock.mockRejectedValue(new Error('Not found'))
    renderPage()
    expect(await screen.findByText(/not found/i)).toBeInTheDocument()
  })

  it('shows exercise title', async () => {
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION_MCQ })
    renderPage()
    expect(await screen.findByText('Algebra Quiz')).toBeInTheDocument()
  })

  it('shows score', async () => {
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION_MCQ })
    renderPage()
    await screen.findByText('Algebra Quiz')
    expect(screen.getByText('7.5')).toBeInTheDocument()
    expect(screen.getByText('/ 10')).toBeInTheDocument()
  })

  it('does not show score section when score is null', async () => {
    getSubmissionMock.mockResolvedValue({ data: { ...SUBMISSION_MCQ, score: null } })
    renderPage()
    await screen.findByText('Algebra Quiz')
    expect(screen.queryByText('/ 10')).not.toBeInTheDocument()
  })

  it('shows correct, incorrect, and skipped counts', async () => {
    // SUBMISSION_MCQ: Q1=correct, Q2=wrong, Q3=skipped (null)
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION_MCQ })
    renderPage()
    await screen.findByText('Algebra Quiz')

    expect(screen.getByLabelText('correct count')).toHaveTextContent('1')
    expect(screen.getByLabelText('incorrect count')).toHaveTextContent('1')
    expect(screen.getByLabelText('skipped count')).toHaveTextContent('1')
  })

  it('counts boolean sub-rows individually', async () => {
    // SUBMISSION_MIXED: 1 correct mcq, 1 correct boolean sub, 3 skipped boolean subs, 1 skipped numeric
    // correct=2 (Q1 + Q2a), incorrect=0, skipped=4 (Q2b,Q2c,Q2d,Q3)
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION_MIXED })
    renderPage('11')
    await screen.findByText('Mixed Quiz')

    expect(screen.getByLabelText('correct count')).toHaveTextContent('2')
    expect(screen.getByLabelText('incorrect count')).toHaveTextContent('0')
    expect(screen.getByLabelText('skipped count')).toHaveTextContent('4')
  })

  it('shows time taken', async () => {
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION_MCQ })
    renderPage()
    await screen.findByText('Algebra Quiz')
    // 5 minutes = 5:00
    expect(screen.getAllByText(/5:00/).length).toBeGreaterThan(0)
  })

  it('shows "View detailed results" link to review page', async () => {
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION_MCQ })
    renderPage()
    await screen.findByText('Algebra Quiz')

    const link = screen.getByRole('link', { name: /view detailed results/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/student/submissions/10/review')
  })

  it('shows "Back to Exercises" link', async () => {
    getSubmissionMock.mockResolvedValue({ data: SUBMISSION_MCQ })
    renderPage()
    await screen.findByText('Algebra Quiz')

    expect(screen.getByRole('link', { name: /back to exercises/i })).toBeInTheDocument()
  })
})
