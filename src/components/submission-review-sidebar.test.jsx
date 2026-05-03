import React, { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { SubmissionReviewSidebar } from './submission-review-sidebar'

// Build a minimal submission fixture.
function makeSubmission(overrides = {}) {
  return {
    score: 7.5,
    started_at: '2026-03-15 10:00:00',
    submitted_at: '2026-03-15 10:05:30',
    answers: [
      { q_id: 1, sub_id: null, type: 'mcq', submitted_answer: 'B', is_correct: 1 },
      { q_id: 2, sub_id: null, type: 'numeric', submitted_answer: '42', is_correct: 0 },
      { q_id: 3, sub_id: null, type: 'mcq', submitted_answer: null, is_correct: 0 },
    ],
    ...overrides,
  }
}

describe('SubmissionReviewSidebar', () => {
  it('returns null when submission is missing', () => {
    const { container } = render(<SubmissionReviewSidebar submission={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the score and "/ 10" suffix', () => {
    render(<SubmissionReviewSidebar submission={makeSubmission({ score: 7.5 })} />)
    expect(screen.getByText('7.5')).toBeInTheDocument()
    expect(screen.getByText('/ 10')).toBeInTheDocument()
  })

  it('shows "No score available" when score is null', () => {
    render(<SubmissionReviewSidebar submission={makeSubmission({ score: null })} />)
    expect(screen.getByText(/no score available/i)).toBeInTheDocument()
  })

  it('color-codes the score: green ≥7, yellow ≥4, red <4', () => {
    // Empty answers so the score value can't collide with q_id row indices.
    const empty = { answers: [] }
    const { rerender, container } = render(
      <SubmissionReviewSidebar submission={makeSubmission({ ...empty, score: 8 })} />,
    )
    expect(container.querySelector('.text-3xl').className).toMatch(/green/)

    rerender(<SubmissionReviewSidebar submission={makeSubmission({ ...empty, score: 5 })} />)
    expect(container.querySelector('.text-3xl').className).toMatch(/yellow/)

    rerender(<SubmissionReviewSidebar submission={makeSubmission({ ...empty, score: 3 })} />)
    expect(container.querySelector('.text-3xl').className).toMatch(/destructive/)
  })

  it('counts correct / incorrect / skipped correctly', () => {
    render(<SubmissionReviewSidebar submission={makeSubmission()} />)
    // Fixture: 1 correct mcq, 1 incorrect numeric, 1 skipped mcq
    const correctNode = screen.getByText('✓').previousSibling
    const incorrectNode = screen.getByText('✗').previousSibling
    const skippedNode = screen.getByText('−').previousSibling
    expect(correctNode).toHaveTextContent('1')
    expect(incorrectNode).toHaveTextContent('1')
    expect(skippedNode).toHaveTextContent('1')
  })

  it('formats time taken as M:SS', () => {
    render(
      <SubmissionReviewSidebar
        submission={makeSubmission({
          started_at: '2026-03-15 10:00:00',
          submitted_at: '2026-03-15 10:05:30',
        })}
      />,
    )
    expect(screen.getByText('5:30')).toBeInTheDocument()
  })

  it('falls back to em-dash when started_at or submitted_at is missing', () => {
    render(
      <SubmissionReviewSidebar
        submission={makeSubmission({ started_at: null, submitted_at: null })}
      />,
    )
    // Time taken row uses em-dash for both time-taken and submitted-on lines.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })

  it('rolls up boolean sub-answers as N/4 in the per-question table', () => {
    const submission = makeSubmission({
      answers: [
        { q_id: 1, sub_id: 'a', type: 'boolean', submitted_answer: '1', is_correct: 1 },
        { q_id: 1, sub_id: 'b', type: 'boolean', submitted_answer: '0', is_correct: 1 },
        { q_id: 1, sub_id: 'c', type: 'boolean', submitted_answer: '1', is_correct: 0 },
        { q_id: 1, sub_id: 'd', type: 'boolean', submitted_answer: '0', is_correct: 0 },
      ],
    })
    render(<SubmissionReviewSidebar submission={submission} />)
    expect(screen.getByText('2/4')).toBeInTheDocument()
  })

  it('marks a fully-skipped boolean question as skipped (em-dash chosen value)', () => {
    const submission = makeSubmission({
      answers: [
        { q_id: 1, sub_id: 'a', type: 'boolean', submitted_answer: null, is_correct: 0 },
        { q_id: 1, sub_id: 'b', type: 'boolean', submitted_answer: null, is_correct: 0 },
        { q_id: 1, sub_id: 'c', type: 'boolean', submitted_answer: null, is_correct: 0 },
        { q_id: 1, sub_id: 'd', type: 'boolean', submitted_answer: null, is_correct: 0 },
      ],
    })
    render(<SubmissionReviewSidebar submission={submission} />)
    // Per-question table cell shows em-dash for skipped boolean question
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
  })

  it('awards points per type: 0.25 mcq, 0.5 numeric, boolean from BOOLEAN_SCORE_TABLE', () => {
    const submission = makeSubmission({
      answers: [
        { q_id: 1, sub_id: null, type: 'mcq', submitted_answer: 'B', is_correct: 1 },
        { q_id: 2, sub_id: null, type: 'numeric', submitted_answer: '42', is_correct: 1 },
        // Boolean: 3 of 4 correct → 0.5 from BOOLEAN_SCORE_TABLE
        { q_id: 3, sub_id: 'a', type: 'boolean', submitted_answer: '1', is_correct: 1 },
        { q_id: 3, sub_id: 'b', type: 'boolean', submitted_answer: '0', is_correct: 1 },
        { q_id: 3, sub_id: 'c', type: 'boolean', submitted_answer: '1', is_correct: 1 },
        { q_id: 3, sub_id: 'd', type: 'boolean', submitted_answer: '0', is_correct: 0 },
      ],
    })
    render(<SubmissionReviewSidebar submission={submission} />)
    expect(screen.getByText('0.25')).toBeInTheDocument()
    // Numeric (0.5 pts) and boolean 3-of-4 (0.5 pts) → "0.5" appears twice.
    expect(screen.getAllByText('0.5')).toHaveLength(2)
  })

  it('scrolls to the question on row click via the questionRefs map', async () => {
    const user = userEvent.setup()
    const refs = createRef()
    const target1 = document.createElement('div')
    const scrollSpy = vi.fn()
    target1.scrollIntoView = scrollSpy
    refs.current = { 1: target1 }

    render(<SubmissionReviewSidebar submission={makeSubmission()} questionRefs={refs} />)

    // First row corresponds to q_id=1 in our fixture
    const firstRow = screen.getAllByRole('row')[0]
    await user.click(firstRow)
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
  })
})
