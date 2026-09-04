import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { changeLanguage } from '@/i18n'
import SettingsPage from './SettingsPage'

const { authState, changePasswordMock, updateMyNameMock } = vi.hoisted(() => ({
  authState: {
    user: { name: 'Nguyễn Văn An', phone: '+84900000001', role: 'teacher', google_email: null },
    token: 'token',
    refreshUser: vi.fn(),
  },
  changePasswordMock: vi.fn(),
  updateMyNameMock: vi.fn(),
}))

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => authState,
}))

vi.mock('@/lib/api', () => ({
  changePassword: changePasswordMock,
  linkGoogle: vi.fn(),
  unlinkGoogle: vi.fn(),
  updateMyName: updateMyNameMock,
}))

afterEach(() => {
  localStorage.clear()
  changePasswordMock.mockReset()
  updateMyNameMock.mockReset()
  authState.refreshUser.mockReset()
  authState.user = { name: 'Nguyễn Văn An', phone: '+84900000001', role: 'teacher', google_email: null }
  return act(() => changeLanguage('en'))
})

function renderPage() {
  return render(
    <MemoryRouter>
      <ThemeProvider defaultTheme="light">
        <SettingsPage />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('SettingsPage sections', () => {
  it('lets users independently collapse and expand each visible setting', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument()

    const profileToggle = screen.getByRole('button', { name: 'Profile settings' })
    const languageToggle = screen.getByRole('button', { name: 'Language settings' })
    const passwordToggle = screen.getByRole('button', { name: 'Change password settings' })
    const accountsToggle = screen.getByRole('button', { name: 'Connected accounts settings' })

    expect(profileToggle).toHaveAttribute('aria-expanded', 'true')
    expect(languageToggle).toHaveAttribute('aria-expanded', 'true')
    expect(passwordToggle).toHaveAttribute('aria-expanded', 'true')
    expect(accountsToggle).toHaveAttribute('aria-expanded', 'true')

    await user.type(screen.getByLabelText('Current password'), 'keep-this-value')
    await user.click(passwordToggle)

    expect(screen.getByRole('button', { name: 'Change password settings' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.queryByLabelText('Current password')).not.toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Connect Google' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Change password settings' }))

    expect(screen.getByLabelText('Current password')).toBeVisible()
    expect(screen.getByLabelText('Current password')).toHaveValue('keep-this-value')
  })
})

describe('SettingsPage profile name', () => {
  it('lets a student rename themselves and refreshes their session profile', async () => {
    const user = userEvent.setup()
    authState.user = { ...authState.user, role: 'student' }
    updateMyNameMock.mockResolvedValue({ data: { name: 'Nguyễn An' } })
    authState.refreshUser.mockResolvedValue()
    renderPage()

    const nameInput = screen.getByRole('textbox', { name: 'Name' })
    expect(nameInput).toHaveValue('Nguyễn Văn An')
    expect(nameInput).toHaveAttribute('autocomplete', 'name')
    await user.clear(nameInput)
    await user.type(nameInput, '  Nguyễn An  ')
    await user.click(screen.getByRole('button', { name: 'Save name' }))

    expect(updateMyNameMock).toHaveBeenCalledWith('token', { name: 'Nguyễn An' })
    expect(authState.refreshUser).toHaveBeenCalledOnce()
    expect(await screen.findByRole('status')).toHaveTextContent('Name updated successfully.')
  })
})

describe('SettingsPage language preference', () => {
  it('switches the authenticated interface to formal Vietnamese', async () => {
    const user = userEvent.setup()
    renderPage()

    await act(async () => {
      await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'vi')
    })

    expect(await screen.findByText('Cài đặt')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Ngôn ngữ' })).toHaveValue('vi')
    expect(screen.getByText('Tài khoản đã liên kết')).toBeInTheDocument()
  })
})

describe('SettingsPage teacher password change', () => {
  it('provides password-manager-compatible fields only to teachers', () => {
    const { unmount } = renderPage()

    expect(screen.getByLabelText('Current password')).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByLabelText('Confirm new password')).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByLabelText('New password')).toHaveAttribute('minlength', '3')

    unmount()
    authState.user = { ...authState.user, role: 'student' }
    renderPage()
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument()
  })

  it('rejects a mismatched password confirmation before making a request', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('Current password'), '123')
    await user.type(screen.getByLabelText('New password'), 'new-password')
    await user.type(screen.getByLabelText('Confirm new password'), 'different-password')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText('New password confirmation does not match.')).toBeInTheDocument()
    expect(changePasswordMock).not.toHaveBeenCalled()
  })

  it('shows an API error when the current password is incorrect', async () => {
    const user = userEvent.setup()
    changePasswordMock.mockRejectedValue(new Error('Current password is incorrect.'))
    renderPage()

    await user.type(screen.getByLabelText('Current password'), 'wrong-password')
    await user.type(screen.getByLabelText('New password'), 'new-password')
    await user.type(screen.getByLabelText('Confirm new password'), 'new-password')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText('Current password is incorrect.')).toBeInTheDocument()
  })

  it('changes the password and clears all password fields', async () => {
    const user = userEvent.setup()
    changePasswordMock.mockResolvedValue({ data: { password_changed: true } })
    renderPage()

    await user.type(screen.getByLabelText('Current password'), '123')
    await user.type(screen.getByLabelText('New password'), 'new-password')
    await user.type(screen.getByLabelText('Confirm new password'), 'new-password')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(changePasswordMock).toHaveBeenCalledWith('token', {
      current_password: '123',
      new_password: 'new-password',
    })
    expect(await screen.findByText('Password changed successfully.')).toBeInTheDocument()
    expect(screen.getByLabelText('Current password')).toHaveValue('')
    expect(screen.getByLabelText('New password')).toHaveValue('')
    expect(screen.getByLabelText('Confirm new password')).toHaveValue('')
  })
})
