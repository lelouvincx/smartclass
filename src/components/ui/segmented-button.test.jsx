import React from 'react'
import { render, screen } from '@testing-library/react'
import { SegmentedButton, SegmentedButtonGroup } from './segmented-button'

describe('SegmentedButton', () => {
  it('exposes the selected segment with pressed state', () => {
    render(
      <SegmentedButtonGroup role="group" aria-label="Quick presets">
        <SegmentedButton selected>60 minutes</SegmentedButton>
        <SegmentedButton>90 minutes</SegmentedButton>
      </SegmentedButtonGroup>,
    )

    expect(screen.getByRole('group', { name: 'Quick presets' })).toHaveAttribute('data-slot', 'segmented-button-group')
    expect(screen.getByRole('button', { name: '60 minutes' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '90 minutes' })).toHaveAttribute('aria-pressed', 'false')
  })
})
