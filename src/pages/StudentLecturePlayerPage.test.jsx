import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StudentLecturePlayerPage from './StudentLecturePlayerPage'

const listLecturesMock = vi.fn()
const useAuthMock = vi.fn()

vi.mock('../lib/api', async (importOriginal) => ({
  ...await importOriginal(),
  listLectures: (...args) => listLecturesMock(...args),
}))

vi.mock('../lib/auth-context', () => ({
  useAuth: () => useAuthMock(),
}))

const lectures = [
  { id: 1, title: 'Introduction', section_name: 'Chapter 1', youtube_url: 'https://youtu.be/abcdefghijk' },
  { id: 2, title: 'Worked example', section_name: 'Chapter 1', youtube_url: 'https://www.youtube.com/watch?v=lmnopqrstuv' },
  { id: 3, title: 'Functions', section_name: 'Chapter 2', youtube_url: 'https://youtu.be/zyxwvutsrqp' },
]

function renderPage(slug = '2-worked-example') {
  return render(
    <MemoryRouter initialEntries={[`/student/lectures/${slug}`]}>
      <Routes>
        <Route path="/student/lectures/:lectureSlug" element={<StudentLecturePlayerPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderTeacherPage(slug = '2-worked-example') {
  return render(
    <MemoryRouter initialEntries={[`/teacher/lectures/${slug}`]}>
      <Routes>
        <Route
          path="/teacher/lectures/:lectureSlug"
          element={<StudentLecturePlayerPage audience="teacher" />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

function renderGuestPage(slug = '2-worked-example') {
  return render(
    <MemoryRouter initialEntries={[`/lectures/${slug}`]}>
      <Routes>
        <Route
          path="/lectures/:lectureSlug"
          element={<StudentLecturePlayerPage audience="guest" />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('StudentLecturePlayerPage', () => {
  beforeEach(() => {
    listLecturesMock.mockReset()
    listLecturesMock.mockResolvedValue({ data: lectures })
    useAuthMock.mockReturnValue({
      token: 'student-token', user: { id: 7, platform_role: 'user', disabled_at: null },
      workspace: { id: 'maths' }, membership: { role: 'student', status: 'active', grades: [12], access_tier: 'standard' },
    })
  })

  it('embeds the selected lecture and provides sequential navigation', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Worked example' })).toBeInTheDocument()
    expect(listLecturesMock).toHaveBeenCalledWith('student-token')
    expect(await screen.findByTitle('Worked example video')).toHaveAttribute(
      'src',
      expect.stringContaining('https://www.youtube-nocookie.com/embed/lmnopqrstuv?enablejsapi=1'),
    )
    expect(screen.getByText('Chapter 1')).toBeInTheDocument()
    expect(screen.getByText('Playback resumes on this device')).toBeInTheDocument()
    expect(screen.queryByText('Lecture 2 of 3')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Previous: Introduction' })).toHaveAttribute('href', '/student/lectures/1-introduction')
    expect(screen.getByRole('link', { name: 'Next: Functions' })).toHaveAttribute('href', '/student/lectures/3-functions')
  })

  it('shows a truthful not-found state for an unknown lecture', async () => {
    renderPage('99-unknown-lecture')

    expect(await screen.findByRole('heading', { name: 'Lecture not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Lectures' })).toHaveAttribute('href', '/student/lectures')
  })

  it('gives teachers the detailed player without student playback tracking', async () => {
    renderTeacherPage()

    expect(await screen.findByRole('heading', { name: 'Worked example' })).toBeInTheDocument()
    expect(screen.getByTitle('Worked example video')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/lmnopqrstuv',
    )
    expect(screen.queryByText('Playback resumes on this device')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Lectures' })).toHaveAttribute('href', '/teacher/lectures')
    expect(screen.getByRole('link', { name: 'Previous: Introduction' })).toHaveAttribute('href', '/teacher/lectures/1-introduction')
    expect(screen.getByRole('link', { name: 'Next: Functions' })).toHaveAttribute('href', '/teacher/lectures/3-functions')
  })

  it('lets an anonymous Guest watch without account-scoped playback tracking', async () => {
    useAuthMock.mockReturnValue({ token: null, user: null })
    renderGuestPage()

    expect(await screen.findByRole('heading', { name: 'Worked example' })).toBeInTheDocument()
    expect(listLecturesMock).toHaveBeenCalledWith(null)
    expect(screen.getByTitle('Worked example video')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/lmnopqrstuv',
    )
    expect(screen.queryByText('Playback resumes on this device')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Lectures' })).toHaveAttribute('href', '/lectures')
    expect(screen.getByRole('link', { name: 'Next: Functions' })).toHaveAttribute('href', '/lectures/3-functions')
  })
})
