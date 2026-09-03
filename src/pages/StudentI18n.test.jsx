import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { changeLanguage } from '@/i18n'
import StudentDashboardPage from './StudentDashboardPage'

vi.mock('@/lib/api', () => ({
  listExercises: vi.fn().mockResolvedValue({ data: [] }),
}))

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ token: 'test-token', user: { id: 7 } }),
}))

vi.mock('@/lib/student-exercise-state', () => ({
  loadStudentExerciseStates: vi.fn().mockResolvedValue({}),
}))

afterEach(async () => {
  await act(() => changeLanguage('en'))
})

describe('student localization', () => {
  it('renders the student dashboard in formal Vietnamese', async () => {
    await act(() => changeLanguage('vi'))
    render(<MemoryRouter><StudentDashboardPage /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: 'Tổng quan' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Thao tác nhanh của học sinh' })).toBeInTheDocument()
    expect(screen.getByText('Xem bài tập')).toBeInTheDocument()
    expect(screen.getByText('Xem lịch sử')).toBeInTheDocument()
  })
})
