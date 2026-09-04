import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect } from 'vitest'
import { TeacherLayout } from './teacher-layout'

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({ user: { name: 'Test Teacher', phone: '+84865481769' }, logout: vi.fn() }),
}))

function renderLayout(initialEntry = '/teacher') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <TeacherLayout />
    </MemoryRouter>,
  )
}

describe('TeacherLayout navigation', () => {
  it('shows the teacher name in the account label', () => {
    renderLayout()

    expect(screen.getAllByText('Test Teacher').length).toBeGreaterThan(0)
    expect(screen.queryByText('+84865481769')).not.toBeInTheDocument()
  })

  it('marks the current destination in the teacher navigation', () => {
    renderLayout('/teacher/students')

    const navigations = screen.getAllByRole('navigation', { name: 'Teacher navigation' })
    expect(navigations).toHaveLength(2)
    navigations.forEach((navigation) => {
      expect(within(navigation).getByRole('link', { name: 'Students' })).toHaveAttribute(
        'aria-current',
        'page',
      )
      expect(within(navigation).getByRole('link', { name: 'Create' })).toHaveAttribute(
        'href',
        '/teacher/exercises/new',
      )
    })
  })
})
