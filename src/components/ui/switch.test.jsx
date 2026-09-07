import React from 'react'
import { render, screen } from '@testing-library/react'
import { Switch } from './switch'

describe('Switch', () => {
  it('uses a Material-scale default track and thumb', () => {
    render(<Switch aria-label="Enable setting" checked onCheckedChange={() => {}} />)

    const control = screen.getByRole('switch', { name: 'Enable setting' })
    expect(control).toHaveAttribute('data-state', 'checked')
    expect(control).toHaveClass('data-[size=default]:h-8')
    expect(control).toHaveClass('data-[size=default]:w-13')
    expect(control.firstElementChild).toHaveClass('group-data-[size=default]/switch:size-6')
  })
})
