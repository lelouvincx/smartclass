import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import AnswerParseProgress from './answer-parse-progress'

const labels = {
  reading: 'Reading PDF',
  rendering: 'Rendering pages',
  waiting: 'Reading answers',
  stillWaiting: 'Still reading answers',
  applying: 'Applying answers',
  complete: 'Answers ready',
  error: 'Could not read answers',
}

function setReducedMotion(matches) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
}

function progressbar() {
  return document.querySelector('[role="progressbar"]')
}

beforeEach(() => {
  vi.useFakeTimers()
  setReducedMotion(false)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AnswerParseProgress', () => {
  it('finishes immediately when parsing completes early and never reaches 100 beforehand', () => {
    const { rerender } = render(
      <AnswerParseProgress stage="waiting" stageProgress={0} labels={labels} />,
    )

    act(() => vi.advanceTimersByTime(2_000))
    expect(Number(progressbar().getAttribute('aria-valuenow'))).toBeLessThan(100)

    rerender(<AnswerParseProgress stage="complete" stageProgress={1} labels={labels} />)
    expect(progressbar()).toHaveAttribute('aria-valuenow', '100')
    expect(progressbar()).toHaveAttribute('aria-valuetext', 'Answers ready')
  })

  it('advances to 90% over 15 seconds, then holds and changes status text', () => {
    render(<AnswerParseProgress stage="waiting" stageProgress={0} labels={labels} />)

    act(() => vi.advanceTimersByTime(15_000))
    expect(progressbar()).toHaveAttribute('aria-valuenow', '90')
    expect(progressbar()).toHaveAttribute('aria-valuetext', 'Still reading answers')
    expect(screen.getByText('Still reading answers')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(10_000))
    expect(progressbar()).toHaveAttribute('aria-valuenow', '90')
  })

  it('freezes progress and displays the supplied error status', () => {
    const { rerender } = render(
      <AnswerParseProgress stage="waiting" stageProgress={0} labels={labels} />,
    )
    act(() => vi.advanceTimersByTime(5_000))
    const progressAtFailure = progressbar().getAttribute('aria-valuenow')

    rerender(<AnswerParseProgress stage="error" stageProgress={0} labels={labels} />)
    act(() => vi.advanceTimersByTime(20_000))

    expect(progressbar()).toHaveAttribute('aria-valuenow', progressAtFailure)
    expect(progressbar()).toHaveAttribute('aria-valuetext', 'Could not read answers')
    expect(screen.getByText('Could not read answers')).toBeInTheDocument()
  })

  it('exposes stage text, not a percentage, as the accessible value text', () => {
    render(<AnswerParseProgress stage="rendering" stageProgress={0.5} labels={labels} />)

    const accessibleProgressbar = screen.getByRole('progressbar')
    expect(accessibleProgressbar).toHaveAttribute('aria-valuetext', 'Rendering pages')
    expect(accessibleProgressbar.getAttribute('aria-valuetext')).not.toMatch(/%/)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('uses discrete stage percentages without a continuous reduced-motion timer', () => {
    setReducedMotion(true)
    const { rerender } = render(
      <AnswerParseProgress stage="waiting" stageProgress={0} labels={labels} />,
    )
    const initialProgress = progressbar().getAttribute('aria-valuenow')

    act(() => vi.advanceTimersByTime(14_000))
    expect(progressbar()).toHaveAttribute('aria-valuenow', initialProgress)

    rerender(<AnswerParseProgress stage="applying" stageProgress={0.3} labels={labels} />)
    expect(progressbar()).toHaveAttribute('aria-valuenow', '95')
    expect(progressbar().firstElementChild).toHaveClass('motion-reduce:transition-none')
  })
})
