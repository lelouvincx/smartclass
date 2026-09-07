import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
      expect(within(navigation).getByRole('button', { name: 'Create' })).toHaveAttribute(
        'aria-haspopup',
        'menu',
      )
    })
  })

  it('offers direct creation paths for exercises, lectures, and students', async () => {
    const user = userEvent.setup()
    renderLayout()

    await user.click(screen.getAllByRole('button', { name: 'Create' })[0])

    expect(screen.getByRole('menuitem', { name: 'Create Exercise' })).toHaveAttribute(
      'href',
      '/teacher/exercises/new',
    )
    expect(screen.getByRole('menuitem', { name: 'Create lecture' })).toHaveAttribute(
      'href',
      '/teacher/lectures?create=lecture',
    )
    expect(screen.getByRole('menuitem', { name: 'Create Student' })).toHaveAttribute(
      'href',
      '/teacher/students?create=student',
    )
  })

  it('keeps the mobile navigation drawer open while choosing what to create', async () => {
    const user = userEvent.setup()
    renderLayout()

    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    const drawer = screen.getByRole('dialog')
    await user.click(within(drawer).getByRole('button', { name: 'Create' }))

    expect(drawer).toBeVisible()
    expect(within(drawer).getByRole('link', { name: 'Create Exercise' })).toBeVisible()
    expect(within(drawer).getByRole('link', { name: 'Create lecture' })).toBeVisible()
    expect(within(drawer).getByRole('link', { name: 'Create Student' })).toBeVisible()
  })
})
