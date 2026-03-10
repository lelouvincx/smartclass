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

    expect(screen.getByText('Password confirmation does not match.')).toBeInTheDocument()
    expect(registerMock).not.toHaveBeenCalled()
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

    expect(await screen.findByText('Registration submitted. Please wait for teacher approval.')).toBeInTheDocument()
  })
})
