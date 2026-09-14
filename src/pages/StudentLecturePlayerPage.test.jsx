import React, { act } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StudentLecturePlayerPage from './StudentLecturePlayerPage'

const getLectureMock = vi.fn()
const useAuthMock = vi.fn()

vi.mock('@/lib/api', async (importOriginal) => ({
  ...await importOriginal(),
  getLecture: (...args) => getLectureMock(...args),
}))

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => useAuthMock(),
}))

const lectureResponse = {
  data: {
    lecture: { id: 2, title: 'Worked example', youtube_url: 'https://www.youtube.com/watch?v=lmnopqrstuv' },
    placement: { id: 22, lesson_id: 12, order_index: 1 },
    breadcrumb: { programme: 12, topic_id: 5, topic_title: 'Chapter 1', lesson_id: 12, lesson_title: 'Linear functions' },
    previous: { placement_id: 21, lecture_id: 1, title: 'Introduction', lesson_id: 12, topic_id: 5, programme: 12 },
    next: { placement_id: 23, lecture_id: 3, title: 'Functions', lesson_id: 12, topic_id: 5, programme: 12 },
  },
}

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="current location">{location.pathname}{location.search}</output>
}

function NavigateProbe({ onNavigate }) {
  const navigate = useNavigate()
  onNavigate(navigate)
  return null
}

function renderPage(slug = '2-worked-example', search = '') {
  return render(
    <MemoryRouter initialEntries={[`/student/lectures/${slug}${search}`]}>
      <Routes>
        <Route path="/student/lectures/:lectureSlug" element={<StudentLecturePlayerPage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}

function renderTeacherPage(slug = '2-worked-example', search = '') {
  return render(
    <MemoryRouter initialEntries={[`/teacher/lectures/${slug}${search}`]}>
      <Routes>
        <Route
          path="/teacher/lectures/:lectureSlug"
          element={<StudentLecturePlayerPage audience="teacher" />}
        />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}

function renderGuestPage(slug = '2-worked-example', search = '') {
  return render(
    <MemoryRouter initialEntries={[`/lectures/${slug}${search}`]}>
      <Routes>
        <Route
          path="/lectures/:lectureSlug"
          element={<StudentLecturePlayerPage audience="guest" />}
        />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

describe('StudentLecturePlayerPage', () => {
  beforeEach(() => {
    getLectureMock.mockReset()
    getLectureMock.mockResolvedValue(lectureResponse)
    useAuthMock.mockReturnValue({
      token: 'student-token', user: { id: 7, platform_role: 'user', disabled_at: null },
      workspace: { id: 'maths' }, membership: { role: 'student', status: 'active', grades: [12], access_tier: 'standard' },
    })
  })

  it('embeds the selected lecture and provides sequential navigation', async () => {
    renderPage('2-worked-example', '?placement=22')

    expect(await screen.findByRole('heading', { name: 'Worked example' })).toBeInTheDocument()
    expect(getLectureMock).toHaveBeenCalledWith('student-token', 2, '22')
    expect(await screen.findByTitle('Worked example video')).toHaveAttribute(
      'src',
      expect.stringContaining('https://www.youtube-nocookie.com/embed/lmnopqrstuv?enablejsapi=1'),
    )
    expect(screen.getByText('Chapter 1 · Linear functions')).toBeInTheDocument()
    expect(screen.getByText('Playback resumes on this device')).toBeInTheDocument()
    expect(screen.queryByText('Lecture 2 of 3')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Lectures' })).toHaveAttribute('href', '/student/lectures?programme=12&lesson=12')
    expect(screen.getByRole('link', { name: 'Previous: Introduction' })).toHaveAttribute('href', '/student/lectures/1-introduction?placement=21')
    expect(screen.getByRole('link', { name: 'Next: Functions' })).toHaveAttribute('href', '/student/lectures/3-functions?placement=23')
  })

  it('lets a long breadcrumb wrap inside the player header', async () => {
    getLectureMock.mockResolvedValue({
      data: {
        ...lectureResponse.data,
        breadcrumb: {
          programme: 12,
          topic_id: 5,
          topic_title: 'Lớp 12 · Mũ và logarit',
          lesson_id: 12,
          lesson_title: 'Bài 1: Một tên bài học rất dài để kiểm tra xuống dòng ở khung phát chung',
        },
      },
    })

    renderPage('2-worked-example', '?placement=22')

    const breadcrumb = await screen.findByText('Lớp 12 · Mũ và logarit · Bài 1: Một tên bài học rất dài để kiểm tra xuống dòng ở khung phát chung')
    expect(breadcrumb).toHaveClass('min-w-0', 'break-words')
    expect(breadcrumb.parentElement).toHaveClass('items-start')
  })

  it('uses contextual neighbours for a shared video in different programmes', async () => {
    getLectureMock.mockResolvedValue({
      data: {
        ...lectureResponse.data,
        placement: { id: 42, lesson_id: 72, order_index: 0 },
        breadcrumb: { programme: 'dgnl', topic_id: 7, topic_title: 'DGNL reasoning', lesson_id: 72, lesson_title: 'Shared video use' },
        previous: { placement_id: 41, lecture_id: 8, title: 'DGNL warmup', lesson_id: 72, topic_id: 7, programme: 'dgnl' },
        next: { placement_id: 43, lecture_id: 9, title: 'DGNL practice', lesson_id: 72, topic_id: 7, programme: 'dgnl' },
      },
    })

    renderPage('2-worked-example', '?placement=42')

    expect(await screen.findByText('DGNL reasoning · Shared video use')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Previous: DGNL warmup' })).toHaveAttribute('href', '/student/lectures/8-dgnl-warmup?placement=41')
    expect(screen.getByRole('link', { name: 'Next: DGNL practice' })).toHaveAttribute('href', '/student/lectures/9-dgnl-practice?placement=43')
  })

  it('replaces missing or rejected placement context with the resolved canonical query', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Worked example' })).toBeInTheDocument()
    expect(getLectureMock).toHaveBeenCalledWith('student-token', 2, null)
    await waitFor(() => expect(screen.getByLabelText('current location')).toHaveTextContent('/student/lectures/2-worked-example?placement=22'))
  })

  it('removes a rejected placement query for an unplaced manager preview', async () => {
    getLectureMock.mockResolvedValue({
      data: {
        lecture: { id: 2, title: 'Worked example', youtube_url: 'https://www.youtube.com/watch?v=lmnopqrstuv' },
        placement: null,
        breadcrumb: null,
        previous: null,
        next: null,
      },
    })

    renderTeacherPage('2-worked-example', '?placement=999')

    expect(await screen.findByRole('heading', { name: 'Worked example' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('current location')).toHaveTextContent('/teacher/lectures/2-worked-example'))
    expect(screen.getByRole('link', { name: 'Back to Lectures' })).toHaveAttribute('href', '/teacher/lectures')
  })

  it('does not request the flat lecture list in the player', async () => {
    renderPage('2-worked-example', '?placement=22')

    expect(await screen.findByRole('heading', { name: 'Worked example' })).toBeInTheDocument()
    expect(getLectureMock).toHaveBeenCalledTimes(1)
  })

  it('does not restore the previous placement when navigating within the same shared video', async () => {
    const second = deferred()
    let navigate
    getLectureMock.mockResolvedValueOnce(lectureResponse).mockReturnValue(second.promise)
    render(<MemoryRouter initialEntries={['/student/lectures/2-worked-example?placement=22']}>
      <NavigateProbe onNavigate={(value) => { navigate = value }} />
      <Routes><Route path="/student/lectures/:lectureSlug" element={<StudentLecturePlayerPage />} /></Routes>
      <LocationProbe />
    </MemoryRouter>)
    await screen.findByRole('heading', { name: 'Worked example' })
    act(() => navigate('/student/lectures/2-worked-example?placement=42'))
    expect(screen.getByLabelText('current location')).toHaveTextContent('placement=42')
    expect(screen.queryByRole('link', { name: 'Next: Functions' })).not.toBeInTheDocument()
    await act(async () => second.resolve({ data: { ...lectureResponse.data, placement: { id: 42 }, previous: null, next: null } }))
    expect(screen.getByLabelText('current location')).toHaveTextContent('placement=42')
  })

  it('hides stale content immediately and ignores a late response after navigation', async () => {
    const first = deferred()
    const second = deferred()
    let navigate
    getLectureMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    render(
      <MemoryRouter initialEntries={['/student/lectures/2-worked-example?placement=22']}>
        <NavigateProbe onNavigate={(value) => { navigate = value }} />
        <Routes>
          <Route path="/student/lectures/:lectureSlug" element={<StudentLecturePlayerPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await act(async () => { first.resolve(lectureResponse) })
    expect(await screen.findByRole('heading', { name: 'Worked example' })).toBeInTheDocument()

    act(() => { navigate('/student/lectures/3-functions?placement=23') })

    expect(screen.queryByRole('heading', { name: 'Worked example' })).not.toBeInTheDocument()
    await act(async () => {
      first.resolve({ data: { ...lectureResponse.data, lecture: { id: 99, title: 'Stale', youtube_url: 'https://youtu.be/abcdefghijk' } } })
      second.resolve({ data: { ...lectureResponse.data, lecture: { id: 3, title: 'Functions', youtube_url: 'https://youtu.be/zyxwvutsrqp' }, placement: { id: 23, lesson_id: 12, order_index: 2 } } })
    })

    expect(await screen.findByRole('heading', { name: 'Functions' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Stale' })).not.toBeInTheDocument()
  })

  it('shows a truthful not-found state for an unknown lecture', async () => {
    getLectureMock.mockRejectedValue(Object.assign(new Error('Lecture not found.'), { status: 404, code: 'NOT_FOUND' }))
    renderPage('99-unknown-lecture')

    expect(await screen.findByRole('heading', { name: 'Lecture not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Lectures' })).toHaveAttribute('href', '/student/lectures')
  })

  it('shows a recoverable loading error with retry', async () => {
    getLectureMock
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce(lectureResponse)

    renderPage('2-worked-example', '?placement=22')

    expect(await screen.findByRole('alert')).toHaveTextContent('Network down')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Worked example' })).toBeInTheDocument()
    expect(getLectureMock).toHaveBeenCalledTimes(2)
  })

  it('gives teachers the detailed player without student playback tracking', async () => {
    renderTeacherPage()

    expect(await screen.findByRole('heading', { name: 'Worked example' })).toBeInTheDocument()
    expect(screen.getByTitle('Worked example video')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/lmnopqrstuv',
    )
    expect(screen.queryByText('Playback resumes on this device')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Lectures' })).toHaveAttribute('href', '/teacher/lectures?programme=12&lesson=12')
    expect(screen.getByRole('link', { name: 'Previous: Introduction' })).toHaveAttribute('href', '/teacher/lectures/1-introduction?placement=21')
    expect(screen.getByRole('link', { name: 'Next: Functions' })).toHaveAttribute('href', '/teacher/lectures/3-functions?placement=23')
  })

  it('lets an anonymous Guest watch without account-scoped playback tracking', async () => {
    useAuthMock.mockReturnValue({ token: null, user: null })
    renderGuestPage()

    expect(await screen.findByRole('heading', { name: 'Worked example' })).toBeInTheDocument()
    expect(getLectureMock).toHaveBeenCalledWith(null, 2, null)
    expect(screen.getByTitle('Worked example video')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/lmnopqrstuv',
    )
    expect(screen.queryByText('Playback resumes on this device')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Lectures' })).toHaveAttribute('href', '/lectures?programme=12&lesson=12')
    expect(screen.getByRole('link', { name: 'Next: Functions' })).toHaveAttribute('href', '/lectures/3-functions?placement=23')
  })
})
