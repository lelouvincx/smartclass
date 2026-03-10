import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import LoginPage from './LoginPage'

const loginMock = vi.fn()

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({
    login: loginMock,
  }),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    loginMock.mockReset()
  })

  it('validates phone format before calling API', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Phone'), '12345')
    await user.type(screen.getByLabelText('Password'), '123')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    expect(screen.getByText('Phone must match +84xxxxxxxxx format.')).toBeInTheDocument()
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('shows API error when login fails', async () => {
    const user = userEvent.setup()
    loginMock.mockRejectedValue(new Error('Invalid phone or password.'))

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Phone'), '+84865481769')
    await user.type(screen.getByLabelText('Password'), 'bad-password')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    expect(await screen.findByText('Invalid phone or password.')).toBeInTheDocument()
  })
})
