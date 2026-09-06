import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TeacherLecturesPage from './TeacherLecturesPage'

const createLectureMock = vi.fn()
const deleteLectureMock = vi.fn()
const listLecturesMock = vi.fn()
const updateLectureMock = vi.fn()
const updateLectureOrderMock = vi.fn()

vi.mock('../lib/api', async (importOriginal) => ({
  ...await importOriginal(),
  createLecture: (...args) => createLectureMock(...args),
  deleteLecture: (...args) => deleteLectureMock(...args),
  listLectures: (...args) => listLecturesMock(...args),
  updateLecture: (...args) => updateLectureMock(...args),
  updateLectureOrder: (...args) => updateLectureOrderMock(...args),
}))

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({ token: 'teacher-token' }),
}))

const lectures = [
  {
    id: 1,
    title: 'Introduction',
    section_name: 'Chapter 1',
    youtube_url: 'https://youtu.be/abcdefghijk',
    order_index: 0,
    is_visible: 1,
    grades: [10, 11, 12],
  },
  {
    id: 2,
    title: 'Worked example',
    section_name: 'Chapter 1',
    youtube_url: 'https://youtu.be/lmnopqrstuv',
    order_index: 1,
    is_visible: 1,
    grades: [10, 11],
  },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <TeacherLecturesPage />
    </MemoryRouter>,
  )
}

describe('TeacherLecturesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    listLecturesMock.mockResolvedValue({ data: lectures })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the empty state flush with its card edges', async () => {
    listLecturesMock.mockResolvedValue({ data: [] })
    renderPage()

    const emptyHeading = await screen.findByRole('heading', { name: 'No lectures yet.' })
    expect(emptyHeading.closest('[data-slot="card"]')).toHaveClass('gap-0', 'py-0')
  })

  it('lists lectures and creates a new lecture through the form', async () => {
    const user = userEvent.setup()
    createLectureMock.mockResolvedValue({ data: { id: 3 } })
    renderPage()

    expect(await screen.findByText('Introduction')).toBeInTheDocument()
    expect(listLecturesMock).toHaveBeenCalledWith('teacher-token')
    expect(screen.getByRole('heading', { name: 'Chapter 1' })).toBeInTheDocument()
    expect(screen.queryByTitle('Introduction')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Watch Introduction' }))

    expect(screen.getByTitle('Introduction')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/abcdefghijk',
    )
    expect(screen.getByTitle('Introduction').parentElement).toHaveClass('sm:ml-10')
    expect(screen.getByRole('button', { name: 'Hide Introduction video' })).toHaveAttribute('aria-expanded', 'true')

    await user.click(screen.getByRole('button', { name: 'Add lecture' }))
    fireEvent.change(screen.getByLabelText('Lecture title'), { target: { value: 'Exam review' } })
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'Revision' } })
    fireEvent.change(screen.getByLabelText('YouTube URL'), { target: { value: 'https://youtu.be/zyxwvutsrqp' } })
    await user.click(screen.getByRole('button', { name: 'Create lecture' }))

    await waitFor(() => {
      expect(createLectureMock).toHaveBeenCalledWith('teacher-token', {
        title: 'Exam review',
        section_name: 'Revision',
        youtube_url: 'https://youtu.be/zyxwvutsrqp',
        grades: [10, 11, 12],
      })
    })
    expect(listLecturesMock).toHaveBeenCalledTimes(2)
  })

  it('creates a lecture for multiple selected grades', async () => {
    const user = userEvent.setup()
    createLectureMock.mockResolvedValue({ data: { id: 3 } })
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Add lecture' }))
    fireEvent.change(screen.getByLabelText('Lecture title'), { target: { value: 'Grade lesson' } })
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'Revision' } })
    fireEvent.change(screen.getByLabelText('YouTube URL'), { target: { value: 'https://youtu.be/zyxwvutsrqp' } })
    await user.click(screen.getByLabelText('Grade 12'))
    await user.click(screen.getByRole('button', { name: 'Create lecture' }))

    expect(createLectureMock).toHaveBeenCalledWith('teacher-token', expect.objectContaining({
      grades: [10, 11],
    }))
  })

  it('edits, reorders, and deletes lectures', async () => {
    const user = userEvent.setup()
    updateLectureMock.mockResolvedValue({ data: lectures[0] })
    updateLectureOrderMock.mockResolvedValue({ data: {} })
    deleteLectureMock.mockResolvedValue({ data: {} })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()

    await screen.findByText('Introduction')
    await user.click(screen.getByRole('button', { name: 'Edit Introduction' }))
    const title = screen.getByLabelText('Lecture title')
    await user.clear(title)
    await user.type(title, 'Introduction revised')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(updateLectureMock).toHaveBeenCalledWith('teacher-token', 1, expect.objectContaining({
      title: 'Introduction revised',
    }))

    await user.click(screen.getByRole('button', { name: 'Move Worked example up' }))
    expect(updateLectureOrderMock).toHaveBeenCalledWith('teacher-token', [2, 1])

    await user.click(screen.getByRole('button', { name: 'Delete Introduction' }))
    expect(deleteLectureMock).toHaveBeenCalledWith('teacher-token', 1)
  })

  it('lets the teacher hide a lecture from students', async () => {
    const user = userEvent.setup()
    updateLectureMock.mockResolvedValue({ data: { ...lectures[0], is_visible: 0 } })
    renderPage()

    await screen.findByText('Introduction')
    const hideButton = screen.getByRole('button', { name: 'Hide Introduction from students' })
    expect(screen.queryByText('Visible to students')).not.toBeInTheDocument()
    expect(hideButton.closest('li')).not.toHaveClass('bg-muted')

    await user.click(hideButton)

    expect(updateLectureMock).toHaveBeenCalledWith('teacher-token', 1, {
      title: 'Introduction',
      section_name: 'Chapter 1',
      youtube_url: 'https://youtu.be/abcdefghijk',
      is_visible: false,
    })
    const showButton = screen.getByRole('button', { name: 'Show Introduction to students' })
    expect(screen.queryByText('Hidden from students')).not.toBeInTheDocument()
    expect(showButton.closest('li')).toHaveClass('bg-muted', 'text-muted-foreground')
  })
})
