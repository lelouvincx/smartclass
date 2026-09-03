import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StudentLecturesPage from './StudentLecturesPage'

const listLecturesMock = vi.fn()

vi.mock('../lib/api', async (importOriginal) => ({
  ...await importOriginal(),
  listLectures: (...args) => listLecturesMock(...args),
}))

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({ token: 'student-token' }),
}))

const lectures = [
  { id: 1, title: 'Introduction', section_name: 'Chapter 1', youtube_url: 'https://youtu.be/abcdefghijk' },
  { id: 2, title: 'Worked example', section_name: 'Chapter 1', youtube_url: 'https://youtu.be/lmnopqrstuv' },
  { id: 3, title: 'Functions', section_name: 'Chapter 2', youtube_url: 'https://youtu.be/zyxwvutsrqp' },
]

describe('StudentLecturesPage', () => {
  beforeEach(() => {
    listLecturesMock.mockReset()
  })

  it('shows lectures as a numbered curriculum grouped by section', async () => {
    listLecturesMock.mockResolvedValue({ data: lectures })
    render(<MemoryRouter><StudentLecturesPage /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Chapter 1' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Chapter 2' })).toBeInTheDocument()
    expect(listLecturesMock).toHaveBeenCalledWith('student-token')
    expect(screen.getByRole('link', { name: 'Watch lecture 1: Introduction' })).toHaveAttribute('href', '/student/lectures/1-introduction')
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('offers a retry when lectures cannot be loaded', async () => {
    listLecturesMock.mockRejectedValue(new Error('Network down'))
    render(<MemoryRouter><StudentLecturesPage /></MemoryRouter>)

    expect(await screen.findByRole('alert')).toHaveTextContent('Network down')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
