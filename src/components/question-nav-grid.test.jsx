import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { QuestionNavGrid, countUnanswered } from './question-nav-grid'

// --- Fixtures ---

const SCHEMA_MCQ = [
  { q_id: 1, type: 'mcq', sub_id: null },
  { q_id: 2, type: 'mcq', sub_id: null },
  { q_id: 3, type: 'mcq', sub_id: null },
]

const SCHEMA_NUMERIC = [
  { q_id: 1, type: 'numeric', sub_id: null },
  { q_id: 2, type: 'numeric', sub_id: null },
]

const SCHEMA_BOOLEAN = [
  { q_id: 1, type: 'boolean', sub_id: 'a' },
  { q_id: 1, type: 'boolean', sub_id: 'b' },
  { q_id: 1, type: 'boolean', sub_id: 'c' },
  { q_id: 1, type: 'boolean', sub_id: 'd' },
]

const SCHEMA_MIXED = [
  { q_id: 1, type: 'mcq', sub_id: null },
  { q_id: 2, type: 'boolean', sub_id: 'a' },
  { q_id: 2, type: 'boolean', sub_id: 'b' },
  { q_id: 2, type: 'boolean', sub_id: 'c' },
  { q_id: 2, type: 'boolean', sub_id: 'd' },
  { q_id: 3, type: 'numeric', sub_id: null },
]

// --- Tests: QuestionNavGrid ---

describe('QuestionNavGrid', () => {
  it('renders one cell per unique question id', () => {
    const onJump = vi.fn()
    render(
      <QuestionNavGrid
        schema={SCHEMA_MCQ}
        answers={{}}
        currentQId={null}
        onJump={onJump}
      />,
    )

    expect(screen.getByLabelText('Jump to question 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Jump to question 2')).toBeInTheDocument()
    expect(screen.getByLabelText('Jump to question 3')).toBeInTheDocument()
  })

  it('shows display index (1-based) as unanswered cell text', () => {
    render(
      <QuestionNavGrid
        schema={SCHEMA_MCQ}
        answers={{ 1: '', 2: '', 3: '' }}
        currentQId={null}
        onJump={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Jump to question 1')).toHaveTextContent('1')
    expect(screen.getByLabelText('Jump to question 2')).toHaveTextContent('2')
    expect(screen.getByLabelText('Jump to question 3')).toHaveTextContent('3')
  })

  it('shows n:LETTER for answered MCQ cell', () => {
    render(
      <QuestionNavGrid
        schema={SCHEMA_MCQ}
        answers={{ 1: 'B', 2: '', 3: '' }}
        currentQId={null}
        onJump={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Jump to question 1')).toHaveTextContent('1:B')
    expect(screen.getByLabelText('Jump to question 2')).toHaveTextContent('2')
  })

  it('shows n:VALUE (truncated to 4 chars) for answered numeric cell', () => {
    render(
      <QuestionNavGrid
        schema={SCHEMA_NUMERIC}
        answers={{ 1: '123456', 2: '42' }}
        currentQId={null}
        onJump={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Jump to question 1')).toHaveTextContent('1:1234')
    expect(screen.getByLabelText('Jump to question 2')).toHaveTextContent('2:42')
  })

  it('shows n:✓ for boolean when all 4 sub-rows answered', () => {
    render(
      <QuestionNavGrid
        schema={SCHEMA_BOOLEAN}
        answers={{ 1: { a: '1', b: '0', c: '1', d: '0' } }}
        currentQId={null}
        onJump={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Jump to question 1')).toHaveTextContent('1:✓')
  })

  it('shows unanswered for boolean when only some sub-rows answered', () => {
    render(
      <QuestionNavGrid
        schema={SCHEMA_BOOLEAN}
        answers={{ 1: { a: '1', b: '', c: '', d: '' } }}
        currentQId={null}
        onJump={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Jump to question 1')).toHaveTextContent('1')
    expect(screen.getByLabelText('Jump to question 1')).not.toHaveTextContent('✓')
  })

  it('applies ring class to current question cell', () => {
    render(
      <QuestionNavGrid
        schema={SCHEMA_MCQ}
        answers={{}}
        currentQId={2}
        onJump={vi.fn()}
      />,
    )

    const cell2 = screen.getByLabelText('Jump to question 2')
    expect(cell2.className).toMatch(/ring-2/)
    const cell1 = screen.getByLabelText('Jump to question 1')
    expect(cell1.className).not.toMatch(/ring-2/)
  })

  it('calls onJump with the correct q_id when a cell is clicked', async () => {
    const user = userEvent.setup()
    const onJump = vi.fn()

    render(
      <QuestionNavGrid
        schema={SCHEMA_MCQ}
        answers={{}}
        currentQId={null}
        onJump={onJump}
      />,
    )

    await user.click(screen.getByLabelText('Jump to question 3'))
    expect(onJump).toHaveBeenCalledWith(3)
  })

  it('handles mixed schema with correct display indices', () => {
    render(
      <QuestionNavGrid
        schema={SCHEMA_MIXED}
        answers={{ 1: 'A', 2: { a: '1', b: '0', c: '1', d: '0' }, 3: '' }}
        currentQId={null}
        onJump={vi.fn()}
      />,
    )

    // Display indices should be 1, 2, 3 (not the q_id values)
    expect(screen.getByLabelText('Jump to question 1')).toHaveTextContent('1:A')
    expect(screen.getByLabelText('Jump to question 2')).toHaveTextContent('2:✓')
    expect(screen.getByLabelText('Jump to question 3')).toHaveTextContent('3')
  })
})

// --- Tests: countUnanswered ---

describe('countUnanswered', () => {
  it('returns total question count when nothing answered', () => {
    const answers = { 1: '', 2: '', 3: '' }
    expect(countUnanswered(SCHEMA_MCQ, answers)).toBe(3)
  })

  it('returns 0 when all MCQ questions answered', () => {
    const answers = { 1: 'A', 2: 'B', 3: 'C' }
    expect(countUnanswered(SCHEMA_MCQ, answers)).toBe(0)
  })

  it('counts partial MCQ answers correctly', () => {
    const answers = { 1: 'A', 2: '', 3: '' }
    expect(countUnanswered(SCHEMA_MCQ, answers)).toBe(2)
  })

  it('counts numeric empty string as unanswered', () => {
    const answers = { 1: '42', 2: '' }
    expect(countUnanswered(SCHEMA_NUMERIC, answers)).toBe(1)
  })

  it('counts boolean as unanswered when not all sub-rows filled', () => {
    const answers = { 1: { a: '1', b: '', c: '', d: '' } }
    expect(countUnanswered(SCHEMA_BOOLEAN, answers)).toBe(1)
  })

  it('counts boolean as answered only when all 4 sub-rows filled', () => {
    const answers = { 1: { a: '1', b: '0', c: '1', d: '0' } }
    expect(countUnanswered(SCHEMA_BOOLEAN, answers)).toBe(0)
  })

  it('handles mixed schema correctly', () => {
    // mcq answered, boolean partially answered, numeric unanswered
    const answers = {
      1: 'A',
      2: { a: '1', b: '', c: '', d: '' },
      3: '',
    }
    expect(countUnanswered(SCHEMA_MIXED, answers)).toBe(2)
  })
})
