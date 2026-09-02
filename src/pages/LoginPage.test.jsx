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

vi.mock('../components/google-signin-button', () => ({
  default: ({ mode, className }) => (
    <button data-testid="google-signin-btn" data-mode={mode} className={className}>
      Continue with Google
    </button>
  ),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    loginMock.mockReset()
  })

  it('exposes labelled, autofill-ready fields with persistent phone guidance', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    const phone = screen.getByLabelText('Phone')
    const password = screen.getByLabelText('Password')

    expect(phone).toHaveAttribute('type', 'tel')
    expect(phone).toHaveAttribute('inputmode', 'tel')
    expect(phone).toHaveAttribute('autocomplete', 'username')
    expect(phone).toHaveAttribute('aria-describedby', 'login-phone-help')
    expect(phone).toBeRequired()
    expect(password).toHaveAttribute('autocomplete', 'current-password')
    expect(password).toBeRequired()
    expect(screen.getByText('Use 0xxxxxxxxx or +84xxxxxxxxx format.')).toBeVisible()
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

    const error = screen.getByRole('alert')
    expect(error).toHaveTextContent('Phone must match +84xxxxxxxxx or 0xxxxxxxxx format.')
    expect(screen.getByLabelText('Phone')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Phone')).toHaveAttribute(
      'aria-describedby',
      'login-phone-help login-error',
    )
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('normalises 0-prefix to +84 before calling API', async () => {
    const user = userEvent.setup()
    loginMock.mockResolvedValue({ data: { user: { role: 'student' } } })

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Phone'), '0865481769')
    await user.type(screen.getByLabelText('Password'), '123')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    expect(loginMock).toHaveBeenCalledWith({ phone: '+84865481769', password: '123' })
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

  it('renders Google sign-in button', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('google-signin-btn')).toBeInTheDocument()
    expect(screen.getByTestId('google-signin-btn')).toHaveAttribute('data-mode', 'login')
  })
})
