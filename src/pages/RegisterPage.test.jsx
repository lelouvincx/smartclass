import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import RegisterPage from './RegisterPage'

const registerMock = vi.fn()

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    register: (...args) => registerMock(...args),
  }
})

describe('RegisterPage', () => {
  beforeEach(() => {
    registerMock.mockReset()
  })

  it('exposes labelled fields with guidance, autofill, and native constraints', () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    )

    const phone = screen.getByLabelText('Phone')
    const password = screen.getByLabelText('Password')
    const confirmPassword = screen.getByLabelText('Confirm Password')

    expect(phone).toHaveAttribute('type', 'tel')
    expect(phone).toHaveAttribute('inputmode', 'tel')
    expect(phone).toHaveAttribute('autocomplete', 'username')
    expect(phone).toHaveAttribute('aria-describedby', 'register-phone-help')
    expect(password).toHaveAttribute('autocomplete', 'new-password')
    expect(password).toHaveAttribute('minlength', '3')
    expect(confirmPassword).toHaveAttribute('autocomplete', 'new-password')
    expect(phone).toBeRequired()
    expect(password).toBeRequired()
    expect(confirmPassword).toBeRequired()
    expect(screen.getByText('Use 0xxxxxxxxx or +84xxxxxxxxx format.')).toBeVisible()
  })

  it('validates password confirmation', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Phone'), '+84900000001')
    await user.type(screen.getByLabelText('Password'), 'abc')
    await user.type(screen.getByLabelText('Confirm Password'), 'def')
    await user.click(screen.getByRole('button', { name: 'Register' }))

    const error = screen.getByRole('alert')
    expect(error).toHaveTextContent('Password confirmation does not match.')
    expect(screen.getByLabelText('Confirm Password')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Confirm Password')).toHaveAttribute(
      'aria-describedby',
      'register-error',
    )
    expect(registerMock).not.toHaveBeenCalled()
  })

  it('normalises 0-prefix to +84 before calling API', async () => {
    const user = userEvent.setup()
    registerMock.mockResolvedValue({ success: true })

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Phone'), '0900000002')
    await user.type(screen.getByLabelText('Password'), 'abc')
    await user.type(screen.getByLabelText('Confirm Password'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Register' }))

    expect(registerMock).toHaveBeenCalledWith({ phone: '+84900000002', password: 'abc' })
  })

  it('shows pending approval success after register', async () => {
    const user = userEvent.setup()
    registerMock.mockResolvedValue({ success: true })

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Phone'), '+84900000002')
    await user.type(screen.getByLabelText('Password'), 'abc')
    await user.type(screen.getByLabelText('Confirm Password'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Register' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Registration submitted. Please wait for teacher approval.',
    )
  })
})
