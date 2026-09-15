import React from 'react'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import enCurriculumManagement from '@/locales/en/curriculum-management'
import TeacherLecturesPage from './TeacherLecturesPage'

const mocks = vi.hoisted(() => ({
  createCurriculumLesson: vi.fn(),
  createCurriculumPlacement: vi.fn(),
  createCurriculumTopic: vi.fn(),
  deleteCurriculumPlacement: vi.fn(),
  deleteLecture: vi.fn(),
  getCurriculumLesson: vi.fn(),
  listCurriculum: vi.fn(),
  listLectures: vi.fn(),
  updateCurriculumLesson: vi.fn(),
  updateCurriculumOrder: vi.fn(),
  updateCurriculumPlacement: vi.fn(),
  updateCurriculumTopic: vi.fn(),
  updateLecture: vi.fn(),
  reload: vi.fn(),
}))

const navigation = {
  programme: 10,
  programmes: [10, 11, 12, 'dgnl'],
  topics: [
    { id: 11, programme: 10, title: 'Algebra', order_index: 0, lessons: [{ id: 21, topic_id: 11, title: 'Linear equations', order_index: 0, unit_count: 2 }] },
    { id: 12, programme: 10, title: 'Geometry', order_index: 1, lessons: [] },
    { id: 14, programme: 12, title: 'Calculus', order_index: 0, lessons: [] },
  ],
  selectedLesson: { id: 21, topic_id: 11, programme: 10, topic_title: 'Algebra', title: 'Linear equations' },
  lessonDetail: {
    units: [
      { placement_id: 101, order_index: 0, lecture: { id: 1, title: 'Shared line', youtube_url: 'https://youtu.be/abcdefghijk', is_visible: 1, minimum_access_tier: 'standard' } },
      { placement_id: 102, order_index: 1, lecture: { id: 2, title: 'Hidden slope', youtube_url: 'https://youtu.be/lmnopqrstuv', is_visible: 0, minimum_access_tier: 'vip' } },
    ],
  },
  revision: 9,
  loading: false,
  lessonLoading: false,
  error: '',
  reload: mocks.reload,
}

const library = [
  {
    id: 1,
    title: 'Shared line',
    youtube_url: 'https://youtu.be/abcdefghijk',
    is_visible: 1,
    minimum_access_tier: 'standard',
    placements: [
      { placement_id: 101, lesson_id: 21, lesson_title: 'Linear equations', topic_id: 11, topic_title: 'Algebra', programme: 10 },
      { placement_id: 201, lesson_id: 31, lesson_title: 'Exam lines', topic_id: 13, topic_title: 'ĐGNL review', programme: 'dgnl' },
    ],
  },
  {
    id: 2,
    title: 'Hidden slope',
    youtube_url: 'https://youtu.be/lmnopqrstuv',
    is_visible: 0,
    minimum_access_tier: 'vip',
    placements: [
      { placement_id: 102, lesson_id: 21, lesson_title: 'Linear equations', topic_id: 11, topic_title: 'Algebra', programme: 10 },
    ],
  },
  { id: 3, title: 'Unplaced library video', youtube_url: 'https://youtu.be/zyxwvutsrqp', is_visible: 1, minimum_access_tier: 'guest', placements: [] },
  {
    id: 4,
    title: 'Public intro',
    youtube_url: 'https://youtu.be/aaaaaaaaaaa',
    is_visible: 1,
    minimum_access_tier: 'guest',
    placements: [
      { placement_id: 301, lesson_id: 21, lesson_title: 'Linear equations', topic_id: 11, topic_title: 'Algebra', programme: 10 },
    ],
  },
]

vi.mock('@/lib/use-curriculum-navigation', () => ({ default: () => navigation }), { virtual: true })
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ token: 'teacher-token' }) }))
vi.mock('@/components/curriculum-navigator', () => ({
  CurriculumNavigator: ({ navigation: nav, management }) => (
    <div>
      <div>{management.programmeActions}</div>
      {nav.topics.map((topic) => <section key={topic.id}><h2>{topic.title}</h2>{management.topicActions(topic)}{topic.lessons.map((lesson) => <div key={lesson.id}><h3>{lesson.title}</h3>{management.lessonActions({ ...lesson, programme: topic.programme, topic_title: topic.title })}</div>)}</section>)}
      <div>{management.lessonHeaderActions}</div>
      <ol>{nav.lessonDetail.units.map((unit) => <li key={unit.placement_id}>{unit.lecture.title}{management.unitActions(unit)}</li>)}</ol>
      {management.footer}
    </div>
  ),
}), { virtual: true })
vi.mock('@/lib/api', async (importOriginal) => ({
  ...await importOriginal(),
  createCurriculumLesson: (...args) => mocks.createCurriculumLesson(...args),
  createCurriculumPlacement: (...args) => mocks.createCurriculumPlacement(...args),
  createCurriculumTopic: (...args) => mocks.createCurriculumTopic(...args),
  deleteCurriculumPlacement: (...args) => mocks.deleteCurriculumPlacement(...args),
  deleteLecture: (...args) => mocks.deleteLecture(...args),
  getCurriculumLesson: (...args) => mocks.getCurriculumLesson(...args),
  listCurriculum: (...args) => mocks.listCurriculum(...args),
  listLectures: (...args) => mocks.listLectures(...args),
  updateCurriculumLesson: (...args) => mocks.updateCurriculumLesson(...args),
  updateCurriculumOrder: (...args) => mocks.updateCurriculumOrder(...args),
  updateCurriculumPlacement: (...args) => mocks.updateCurriculumPlacement(...args),
  updateCurriculumTopic: (...args) => mocks.updateCurriculumTopic(...args),
  updateLecture: (...args) => mocks.updateLecture(...args),
}))

function renderPage() {
  return render(<MemoryRouter><TeacherLecturesPage /></MemoryRouter>)
}

async function openMenu(name) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name }))
  return user
}

describe('TeacherLecturesPage curriculum management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.hasPointerCapture ??= () => false
    Element.prototype.setPointerCapture ??= () => {}
    Element.prototype.releasePointerCapture ??= () => {}
    Element.prototype.scrollIntoView ??= () => {}
    i18n.addResourceBundle('en', 'translation', enCurriculumManagement, true, true)
    mocks.listLectures.mockResolvedValue({ data: { revision: 8, lectures: library } })
    mocks.listCurriculum.mockImplementation((_, programme) => Promise.resolve({
      data: {
        programme,
        revision: 8,
        topics: programme === 'dgnl'
          ? [{ id: 13, programme: 'dgnl', title: 'ĐGNL review', lessons: [{ id: 31, topic_id: 13, title: 'Exam lines' }] }]
          : navigation.topics.filter((topic) => topic.programme === programme),
      },
    }))
    mocks.getCurriculumLesson.mockResolvedValue({ data: { revision: 8, units: navigation.lessonDetail.units } })
    mocks.createCurriculumTopic.mockResolvedValue({ data: { revision: 10 } })
    mocks.createCurriculumPlacement.mockResolvedValue({ data: { revision: 10 } })
    mocks.updateCurriculumLesson.mockResolvedValue({ data: { revision: 10 } })
    mocks.updateCurriculumOrder.mockResolvedValue({ data: { revision: 10 } })
    mocks.updateCurriculumPlacement.mockResolvedValue({ data: { revision: 10 } })
    mocks.updateCurriculumTopic.mockResolvedValue({ data: { revision: 10 } })
    mocks.updateLecture.mockResolvedValue({ data: { revision: 10 } })
    mocks.deleteCurriculumPlacement.mockResolvedValue({ data: { revision: 10 } })
    mocks.deleteLecture.mockResolvedValue({ data: { revision: 10 } })
  })

  afterEach(() => cleanup())

  it('creates a topic with labelled programme destination and frozen minimum revision', async () => {
    renderPage()
    const user = await openMenu('Programme actions')
    await user.click(screen.getByRole('menuitem', { name: /Add topic/ }))
    await user.type(screen.getByLabelText('Title'), 'Functions')
    await user.click(screen.getByLabelText('Programme'))
    await user.click(await screen.findByRole('option', { name: 'Grade 10' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(mocks.createCurriculumTopic).toHaveBeenCalledWith('teacher-token', { programme: 10, title: 'Functions', expected_revision: 8 })
  })

  it('adds a new video using the backend placement shape', async () => {
    renderPage()
    const user = await openMenu('Lesson actions for Linear equations')
    await user.click(screen.getByRole('menuitem', { name: /Add new video/ }))
    await user.type(screen.getByLabelText('Video title'), 'New lesson video')
    await user.type(screen.getByLabelText('YouTube URL'), 'https://youtu.be/aaaaaaaaaaa')
    await user.click(screen.getByRole('button', { name: 'VIP' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(mocks.createCurriculumPlacement).toHaveBeenCalledWith('teacher-token', expect.objectContaining({ lesson_id: 21, expected_revision: 8, lecture: expect.objectContaining({ title: 'New lesson video', minimum_access_tier: 'vip' }) }))
  })

  it('adds an existing unplaced video using the backend placement shape', async () => {
    renderPage()
    const user = await openMenu('Lesson actions for Linear equations')
    await user.click(screen.getByRole('menuitem', { name: /Use existing video/ }))
    await user.click(screen.getByLabelText('Existing shared video'))
    await user.click(await screen.findByRole('option', { name: 'Unplaced library video' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(mocks.createCurriculumPlacement).toHaveBeenCalledWith('teacher-token', { lesson_id: 21, lecture_id: 3, expected_revision: 8 })
  })

  it('keeps edge-case videos that are not in any lesson collapsed until opened', async () => {
    const user = userEvent.setup()
    renderPage()

    const toggle = await screen.findByRole('button', { name: /Videos not in any lesson/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveTextContent('1 shared video is in the library but has not been added to a lesson.')
    expect(screen.queryByText('Unplaced library video')).not.toBeInTheDocument()

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Unplaced library video')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unit actions for Unplaced library video' })).toBeInTheDocument()
  })

  it('enumerates affected shared videos before moving a topic and submits the confirmed payload', async () => {
    renderPage()
    const user = await openMenu('Topic actions for Algebra')
    await user.click(screen.getByRole('menuitem', { name: /Move to/ }))
    await user.click(screen.getByLabelText('Programme'))
    await user.click(await screen.findByRole('option', { name: 'Grade 12' }))

    const affected = screen.getByRole('list', { name: 'Affected videos' })
    expect(within(affected).getByText('Shared line')).toBeInTheDocument()
    expect(within(affected).getByText('Hidden slope')).toBeInTheDocument()
    expect(within(affected).getByText('Public intro')).toBeInTheDocument()
    expect(screen.getAllByText('Grade 12 › Algebra › Linear equations')).toHaveLength(3)
    expect(screen.getAllByText('Hidden: teacher-only.')).toHaveLength(2)
    expect(screen.getAllByText('Public video: programmes do not restrict access.')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(mocks.updateCurriculumTopic).toHaveBeenCalledWith('teacher-token', 11, { programme: 12, expected_revision: 8 })
  })

  it('enumerates affected shared videos before moving a lesson and submits the confirmed payload', async () => {
    renderPage()
    const user = await openMenu('Lesson actions for Linear equations')
    await user.click(screen.getByRole('menuitem', { name: /Move to/ }))
    await user.click(screen.getByLabelText('Topic'))
    await user.click(await screen.findByRole('option', { name: 'Grade 12 › Calculus' }))

    const affected = screen.getByRole('list', { name: 'Affected videos' })
    expect(within(affected).getByText('Shared line')).toBeInTheDocument()
    expect(screen.getAllByText('Grade 12 › Calculus › Linear equations')).toHaveLength(3)
    expect(screen.getAllByText('Grade 10 › Algebra › Linear equations')).toHaveLength(3)
    expect(screen.getAllByText('Hidden: teacher-only.')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(mocks.updateCurriculumLesson).toHaveBeenCalledWith('teacher-token', 21, { topic_id: 14, expected_revision: 8 })
  })

  it('previews old and new access before saving shared-video tier and visibility edits', async () => {
    renderPage()
    const user = await openMenu('Unit actions for Shared line')
    await user.click(screen.getByRole('menuitem', { name: /Edit shared video/ }))
    await user.click(screen.getByRole('button', { name: 'VIP' }))
    await user.click(screen.getByRole('button', { name: 'Hidden' }))

    expect(screen.getByText('Standard → VIP')).toBeInTheDocument()
    expect(screen.getByText('Visible → Hidden')).toBeInTheDocument()
    expect(screen.getByText('Access before').parentElement).toHaveTextContent('Standard in Grade 10, ĐGNL.')
    expect(screen.getByText('Access after').parentElement).toHaveTextContent('Hidden: teacher-only.')

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(mocks.updateLecture).toHaveBeenCalledWith('teacher-token', 1, expect.objectContaining({ minimum_access_tier: 'vip', is_visible: false, expected_revision: 8 }))
  })

  it('keeps stale shared-video edits open, retains the draft, and disables duplicate resubmit', async () => {
    cleanup()
    renderPage()
    const stale = new Error('Curriculum has changed. Reload and try again.')
    stale.status = 409
    stale.code = 'CURRICULUM_CHANGED'
    mocks.updateLecture.mockRejectedValueOnce(stale).mockResolvedValueOnce({ data: { revision: 11 } })
    const user = await openMenu('Unit actions for Shared line')
    await user.click(screen.getByRole('menuitem', { name: /Edit shared video/ }))
    const title = screen.getByLabelText('Video title')
    await user.clear(title)
    await user.type(title, 'Retried title')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(/curriculum changed/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue('Retried title')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Reload' }))
    expect(screen.getByRole('heading', { name: 'Discard changes?' })).toBeInTheDocument()
    expect(mocks.updateLecture).toHaveBeenCalledTimes(1)
  })

  it('orders lesson units by placement_id with button controls', async () => {
    renderPage()
    const user = await openMenu('Lesson actions for Linear equations')
    await user.click(screen.getByRole('menuitem', { name: /Reorder units/ }))
    await user.click(screen.getByRole('button', { name: 'Move Hidden slope up' }))
    await user.click(screen.getByRole('button', { name: 'Save order' }))

    expect(mocks.updateCurriculumOrder).toHaveBeenCalledWith('teacher-token', { parent_type: 'lesson', parent_id: 21, ids: [102, 101], expected_revision: 8 })
  })

  it('enumerates audience changes before removing a placement or deleting a shared video', async () => {
    renderPage()
    const user = await openMenu('Unit actions for Shared line')
    await user.click(screen.getByRole('menuitem', { name: /Remove from lesson/ }))

    expect(screen.getByText('Affected paths')).toBeInTheDocument()
    expect(screen.getByText('Grade 10 › Algebra › Linear equations')).toBeInTheDocument()
    expect(screen.getByText('Programmes lost').parentElement).toHaveTextContent('Grade 10')
    await user.click(screen.getByRole('button', { name: 'Remove from lesson' }))
    expect(mocks.deleteCurriculumPlacement).toHaveBeenCalledWith('teacher-token', 101, 8)

    cleanup()
    renderPage()
    await openMenu('Unit actions for Shared line')
    await user.click(screen.getByRole('menuitem', { name: /Delete shared video/ }))
    expect(screen.getByText('Grade 10 › Algebra › Linear equations')).toBeInTheDocument()
    expect(screen.getByText('ĐGNL › ĐGNL review › Exam lines')).toBeInTheDocument()
  })

  it('asks for a discard decision instead of closing a dirty draft', async () => {
    const pushState = vi.spyOn(window.history, 'pushState')
    renderPage()
    const user = await openMenu('Lesson actions for Linear equations')
    await user.click(screen.getByRole('menuitem', { name: /Add new video/ }))
    await user.type(screen.getByLabelText('Video title'), 'Dirty draft')
    expect(pushState).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('heading', { name: 'Discard changes?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByDisplayValue('Dirty draft')).toBeInTheDocument()
  })

  it('routes dirty browser back events through the shared discard guard', async () => {
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
    window.history.replaceState({ idx: 4 }, '', '/')
    renderPage()
    const user = await openMenu('Lesson actions for Linear equations')
    await user.click(screen.getByRole('menuitem', { name: /Add new video/ }))
    await user.type(screen.getByLabelText('Video title'), 'Dirty draft')

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: { idx: 3 } }))
    })

    expect(go).toHaveBeenCalledWith(1)
    expect(screen.getByRole('heading', { name: 'Discard changes?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByDisplayValue('Dirty draft')).toBeInTheDocument()
  })
})
