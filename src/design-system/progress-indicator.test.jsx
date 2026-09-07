import React from 'react'
import { render, screen } from '@testing-library/react'
import { ProgressIndicator } from './progress-indicator'

describe('ProgressIndicator', () => {
  it('exposes Material-style determinate progress semantics', () => {
    render(<ProgressIndicator label="Upload" value={40} valueText="Uploading files" />)

    const progressbar = screen.getByRole('progressbar', { name: 'Upload' })
    expect(progressbar).toHaveAttribute('aria-valuemin', '0')
    expect(progressbar).toHaveAttribute('aria-valuemax', '100')
    expect(progressbar).toHaveAttribute('aria-valuenow', '40')
    expect(progressbar).toHaveAttribute('aria-valuetext', 'Uploading files')
  })

  it('clamps invalid progress values to a safe range', () => {
    const { rerender } = render(<ProgressIndicator value={140} valueText="Too high" />)

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')

    rerender(<ProgressIndicator value={-10} valueText="Too low" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })

  it('exposes indeterminate progress without a determinate value', () => {
    render(<ProgressIndicator label="Loading preview" valueText="Loading preview" />)

    const progressbar = screen.getByRole('progressbar', { name: 'Loading preview' })
    expect(progressbar).not.toHaveAttribute('aria-valuenow')
    expect(progressbar).toHaveAttribute('data-indeterminate')
    expect(progressbar).toHaveAttribute('aria-valuetext', 'Loading preview')
  })
})
