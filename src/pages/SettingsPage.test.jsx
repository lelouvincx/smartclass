import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { changeLanguage } from '@/i18n'
import SettingsPage from './SettingsPage'

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: { phone: '+84900000001', role: 'student', google_email: null },
    token: 'token',
    refreshUser: vi.fn(),
  }),
}))

afterEach(() => {
  localStorage.clear()
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
