import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StudentLecturesPage from './StudentLecturesPage'

const listCurriculumMock = vi.fn()
const getCurriculumLessonMock = vi.fn()
const useAuthMock = vi.fn()

vi.mock('../lib/api', async (importOriginal) => ({
  ...await importOriginal(),
  listCurriculum: (...args) => listCurriculumMock(...args),
  getCurriculumLesson: (...args) => getCurriculumLessonMock(...args),
}))

vi.mock('../lib/auth-context', () => ({
  useAuth: () => useAuthMock(),
}))

const topics = [
  {
    id: 1,
    programme: 12,
    title: 'Vectors',
    order_index: 0,
    lessons: [
      {
        id: 11,
        topic_id: 1,
        title: 'Vector basics',
        order_index: 0,
        unit_count: 2,
        units: [
          {
            placement_id: 101,
            order_index: 0,
            lecture: { id: 201, title: 'Intro unit', youtube_url: 'https://youtu.be/abcdefghijk', is_visible: 1, minimum_access_tier: 'guest' },
          },
          {
            placement_id: 102,
            order_index: 1,
            lecture: { id: 202, title: 'Worked example', youtube_url: 'https://youtu.be/lmnopqrstuv', is_visible: 1, minimum_access_tier: 'standard' },
          },
        ],
      },
    ],
  },
]

const lessonDetail = {
  breadcrumb: { programme: 12, topic_id: 1, topic_title: 'Vectors', lesson_id: 11, lesson_title: 'Vector basics' },
  lesson: { id: 11, title: 'Vector basics', order_index: 0, topic_id: 1, programme: 12 },
  units: [
    {
      placement_id: 101,
      order_index: 0,
      lecture: { id: 201, title: 'Intro unit', youtube_url: 'https://youtu.be/abcdefghijk', is_visible: 1, minimum_access_tier: 'guest' },
    },
    {
      placement_id: 102,
      order_index: 1,
      lecture: { id: 202, title: 'Worked example', youtube_url: 'https://youtu.be/lmnopqrstuv', is_visible: 1, minimum_access_tier: 'standard' },
    },
  ],
}

describe('StudentLecturesPage curriculum browser', () => {
  beforeEach(() => {
    listCurriculumMock.mockReset()
    getCurriculumLessonMock.mockReset()
    useAuthMock.mockReturnValue({
      token: 'student-token',
      user: { id: 7, platform_role: 'user', disabled_at: null },
      workspace: { id: 'maths' },
      membership: { role: 'student', status: 'active', grades: [12], access_tier: 'standard' },
    })
    listCurriculumMock.mockResolvedValue({ data: { programme: 12, topics, revision: 8 } })
    getCurriculumLessonMock.mockResolvedValue({ data: { ...lessonDetail, revision: 8 } })
  })

  it('shows the shared curriculum explorer from the actual API response shape', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={["/student/lectures?programme=12"]}><StudentLecturesPage /></MemoryRouter>)

    expect(await screen.findByRole('button', { name: /Vectors, 1 lesson/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Expand Vectors' }))
    expect(screen.getByRole('button', { name: /Vector basics, 2 units/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Choose a lesson' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Watch unit 1: Intro unit' })).not.toBeInTheDocument()
    expect(listCurriculumMock).toHaveBeenCalledWith('student-token', 12)
    expect(getCurriculumLessonMock).not.toHaveBeenCalled()
  })

  it('lets an anonymous guest browse public curriculum on public player URLs', async () => {
    const user = userEvent.setup()
    useAuthMock.mockReturnValue({ token: null, user: null, workspace: { id: 'english' } })
    listCurriculumMock.mockResolvedValue({ data: { programme: 10, topics } })

    render(<MemoryRouter initialEntries={["/lectures?programme=10"]}><StudentLecturesPage audience="guest" /></MemoryRouter>)

    await screen.findByRole('button', { name: /Vectors, 1 lesson/ })
    await user.click(screen.getByRole('button', { name: 'Expand Vectors' }))
    expect(screen.getByRole('button', { name: /Vector basics, 2 units/ })).toBeInTheDocument()
    expect(listCurriculumMock).toHaveBeenCalledWith(null, 10)
    expect(getCurriculumLessonMock).not.toHaveBeenCalled()
  })

  it('uses four English programme choices and no THPT outside maths workspaces', async () => {
    useAuthMock.mockReturnValue({ token: 'student-token', user: { id: 8 }, workspace: { id: 'english' } })
    listCurriculumMock.mockResolvedValue({ data: { programme: 10, topics: [] } })

    render(<MemoryRouter initialEntries={["/student/lectures?programme=10"]}><StudentLecturesPage /></MemoryRouter>)

    const group = await screen.findByRole('group', { name: 'Programme' })
    expect(group).toHaveAttribute('data-slot', 'segmented-button-group')
    expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual(['Grade 10', 'Grade 11', 'Grade 12', 'ĐGNL'])
    expect(within(group).getByRole('button', { name: 'Grade 10' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).queryByRole('button', { name: 'THPT' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Programme' })).not.toBeInTheDocument()
  })

  it('uses the same selected lesson detail pane as the teacher view', async () => {
    window.history.pushState({}, '', '/student/lectures?programme=12&lesson=11')
    render(<BrowserRouter><StudentLecturesPage /></BrowserRouter>)

    expect(await screen.findByRole('heading', { name: 'Vector basics' })).toBeInTheDocument()
    await screen.findByRole('link', { name: 'Watch unit 1: Intro unit' })
    expect(screen.getByRole('link', { name: 'Watch unit 1: Intro unit' })).toHaveAttribute(
      'href',
      '/student/lectures/201-intro-unit?placement=101',
    )
    expect(screen.getByRole('link', { name: 'Watch unit 2: Worked example' })).toHaveAttribute(
      'href',
      '/student/lectures/202-worked-example?placement=102',
    )
    expect(screen.queryByRole('heading', { name: 'Choose a lesson' })).not.toBeInTheDocument()
    expect(getCurriculumLessonMock).toHaveBeenCalledWith('student-token', 11)
  })

  it('defaults a student without a programme URL to their first assigned programme', async () => {
    useAuthMock.mockReturnValue({
      token: 'student-token',
      user: { id: 7, platform_role: 'user', disabled_at: null },
      workspace: { id: 'maths' },
      membership: { role: 'student', status: 'active', grades: [12], access_tier: 'standard' },
    })

    render(<MemoryRouter initialEntries={["/student/lectures"]}><StudentLecturesPage /></MemoryRouter>)

    await screen.findByRole('button', { name: /Vectors, 1 lesson/ })
    expect(listCurriculumMock).toHaveBeenCalledWith('student-token', 12)
  })

  it('shows recoverable empty and error states without manager fetches', async () => {
    listCurriculumMock.mockRejectedValue(new Error('Network down'))
    render(<MemoryRouter initialEntries={["/student/lectures?programme=12"]}><StudentLecturesPage /></MemoryRouter>)

    expect(await screen.findByRole('alert')).toHaveTextContent('Network down')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(getCurriculumLessonMock).not.toHaveBeenCalled()
  })
})
