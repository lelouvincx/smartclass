import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect } from 'vitest'
import { StudentLayout } from './student-layout'

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({ user: { phone: '+84900000001' }, logout: vi.fn() }),
}))

function renderLayout() {
  return render(
    <MemoryRouter>
      <StudentLayout />
    </MemoryRouter>,
  )
}

describe('StudentLayout spacing', () => {
  it('renders the header container with max-w-4xl and px-8', () => {
    renderLayout()
    const headerInner = screen
      .getByText('SmartClass')
      .closest('div[class*="max-w-"]')
    expect(headerInner.className).toContain('max-w-4xl')
    expect(headerInner.className).toContain('px-8')
  })

  it('renders the main content container with max-w-4xl and px-8', () => {
    renderLayout()
    const main = document.querySelector('main')
    expect(main.className).toContain('max-w-4xl')
    expect(main.className).toContain('px-8')
  })
})
