import React from 'react'
import { render, screen } from '@testing-library/react'
import { FieldError } from './field'

describe('FieldError', () => {
  it('announces validation errors politely', () => {
    render(<FieldError>Enter a phone number.</FieldError>)

    const error = screen.getByRole('alert')
    expect(error).toHaveAttribute('aria-live', 'polite')
    expect(error).toHaveTextContent('Enter a phone number.')
  })
})
