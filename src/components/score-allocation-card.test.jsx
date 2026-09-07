import React, { createRef } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import ScoreAllocationCard from './score-allocation-card'

const rows = [
  { q_id: 1, section_key: 'part-1', section_title: 'Part I', local_number: 1, type: 'mcq' },
  { q_id: 2, section_key: 'part-1', section_title: 'Part I', local_number: 2, type: 'numeric' },
  ...['a', 'b', 'c', 'd'].map(sub_id => ({
    q_id: 3, section_key: 'part-2', section_title: 'Part II', local_number: 1, type: 'boolean', sub_id,
  })),
]

function Harness({ initialMode = 'automatic', initialValues = {}, cardRef = null }) {
  const [mode, setMode] = React.useState(initialMode)
  const [values, setValues] = React.useState(initialValues)
  return (
    <ScoreAllocationCard
      ref={cardRef}
      rows={rows}
      mode={mode}
      onModeChange={setMode}
      values={values}
      onValuesChange={setValues}
    />
  )
}

describe('ScoreAllocationCard', () => {
  it('shows truthful automatic relative weights without rounded points', () => {
    render(<Harness />)

    expect(screen.getByRole('heading', { name: 'Score allocation' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Automatic allocation' })).toBeChecked()
    expect(screen.getByText('Automatic allocation · final score normalized to 10.0')).toBeInTheDocument()
    expect(screen.getByText('0.25')).toBeInTheDocument()
    expect(screen.getByText('0.50')).toBeInTheDocument()
    expect(screen.getByText('1.00')).toBeInTheDocument()
    expect(screen.queryByText(/points per question/i)).not.toBeInTheDocument()
  })

  it('starts custom mode with equal values and keeps one boolean allocation', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('radio', { name: 'Custom allocation' }))

    expect(screen.getByLabelText('Points for Part I, question 1')).toHaveValue('3.34')
    expect(screen.getByLabelText('Points for Part I, question 2')).toHaveValue('3.33')
    expect(screen.getByLabelText('Points for Part II, question 1')).toHaveValue('3.33')
    expect(screen.getAllByRole('textbox')).toHaveLength(3)
    expect(screen.getByText('10.0 of 10.0 allocated')).toBeInTheDocument()
  })

  it('validates on blur, clears the field error on input, and focuses linked summary on submit', async () => {
    const user = userEvent.setup()
    const ref = createRef()
    render(<Harness cardRef={ref} initialMode="custom" initialValues={{ 1: '3.34', 2: '3.33', 3: '3.33' }} />)

    const first = screen.getByLabelText('Points for Part I, question 1')
    await user.clear(first)
    await user.type(first, '3.333')
    await user.tab()
    expect(screen.getByText('Enter no more than 2 decimal places.')).toBeInTheDocument()

    await user.clear(first)
    await user.type(first, '3.34')
    expect(screen.queryByText('Enter no more than 2 decimal places.')).not.toBeInTheDocument()

    await user.clear(first)
    act(() => expect(ref.current.validate()).toBe(false))
    await waitFor(() => expect(screen.getByRole('alert', { name: 'Fix score allocation' })).toHaveFocus())
    expect(screen.getByRole('link', { name: /Part I, question 1/i })).toHaveAttribute('href', '#score-allocation-1')
  })

  it('preserves custom values while toggling and offers both redistributions', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('radio', { name: 'Custom allocation' }))
    const first = screen.getByLabelText('Points for Part I, question 1')
    await user.clear(first)
    await user.type(first, '4.00')
    await user.click(screen.getByRole('radio', { name: 'Automatic allocation' }))
    await user.click(screen.getByRole('radio', { name: 'Custom allocation' }))
    expect(screen.getByLabelText('Points for Part I, question 1')).toHaveValue('4.00')

    await user.click(screen.getByRole('button', { name: 'Use type proportions' }))
    expect(screen.getByLabelText('Points for Part I, question 1')).toHaveValue('1.43')
    await user.click(screen.getByRole('button', { name: 'Use equal points' }))
    expect(screen.getByLabelText('Points for Part I, question 1')).toHaveValue('3.34')
  })

  it('disables custom allocation above 1000 questions', () => {
    const manyRows = Array.from({ length: 1001 }, (_, index) => ({ q_id: index + 1, type: 'mcq' }))
    render(
      <ScoreAllocationCard
        rows={manyRows}
        mode="automatic"
        onModeChange={vi.fn()}
        values={{}}
        onValuesChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('radio', { name: 'Custom allocation' })).toBeDisabled()
    expect(screen.getByText(/available for up to 1,000 questions/i)).toBeInTheDocument()
  })
})
