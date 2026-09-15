import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCurriculumNavigation } from './use-curriculum-navigation'

const listCurriculumMock = vi.fn()
const getCurriculumLessonMock = vi.fn()

vi.mock('./api', async (importOriginal) => ({
  ...await importOriginal(),
  listCurriculum: (...args) => listCurriculumMock(...args),
  getCurriculumLesson: (...args) => getCurriculumLessonMock(...args),
}))

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function Probe({ token = 'student-token', workspace = { id: 'maths' }, options }) {
  const navigation = useCurriculumNavigation(token, workspace, options)
  return (
    <div>
      <output data-testid="programme">{String(navigation.programme)}</output>
      <output data-testid="programmes">{navigation.programmes.join(',')}</output>
      <output data-testid="topics">{navigation.topics.map((topic) => topic.title).join(',')}</output>
      <output data-testid="selectedLesson">{navigation.selectedLesson?.title || ''}</output>
      <output data-testid="revision">{navigation.revision ?? ''}</output>
      <output data-testid="error">{navigation.error}</output>
      <button type="button" onClick={() => navigation.selectProgramme(11)}>Programme 11</button>
      <button type="button" onClick={() => navigation.selectLesson(12)}>Lesson 12</button>
      <button type="button" onClick={() => navigation.reload().catch((error) => { window.__reloadError = error.message })}>Reload</button>
    </div>
  )
}

describe('useCurriculumNavigation', () => {
  beforeEach(() => {
    listCurriculumMock.mockReset()
    getCurriculumLessonMock.mockReset()
    delete window.__reloadError
  })

  it('ignores stale rapid-navigation responses and clears old content immediately', async () => {
    const first = deferred()
    const second = deferred()
    listCurriculumMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    render(<MemoryRouter initialEntries={["/student/lectures?programme=10"]}><Probe /></MemoryRouter>)
    expect(screen.getByTestId('topics')).toHaveTextContent('')

    await act(async () => {
      screen.getByRole('button', { name: 'Programme 11' }).click()
    })
    expect(screen.getByTestId('topics')).toHaveTextContent('')

    await act(async () => {
      second.resolve({ data: { programme: 11, topics: [{ id: 2, title: 'Fresh', lessons: [] }], revision: 4 } })
    })
    await waitFor(() => expect(screen.getByTestId('topics')).toHaveTextContent('Fresh'))

    await act(async () => {
      first.resolve({ data: { programme: 10, topics: [{ id: 1, title: 'Stale', lessons: [] }], revision: 3 } })
    })
    expect(screen.getByTestId('topics')).toHaveTextContent('Fresh')
    expect(screen.getByTestId('topics')).not.toHaveTextContent('Stale')
  })

  it('keeps a conservative revision across tree and detail reads', async () => {
    listCurriculumMock.mockResolvedValue({
      data: {
        programme: 12,
        revision: 8,
        topics: [{ id: 1, title: 'Topic', lessons: [{ id: 12, title: 'Lesson', unit_count: 1 }] }],
      },
    })
    getCurriculumLessonMock.mockResolvedValue({ data: { lesson: { id: 12, title: 'Lesson' }, units: [], revision: 9 } })

    render(<MemoryRouter initialEntries={["/student/lectures?programme=12&topic=1&lesson=12"]}><Probe /></MemoryRouter>)

    expect(await screen.findByTestId('selectedLesson')).toHaveTextContent('Lesson')
    await waitFor(() => expect(getCurriculumLessonMock).toHaveBeenCalledWith('student-token', 12))
    expect(screen.getByTestId('revision')).toHaveTextContent('8')
  })

  it('defaults to the first preferred programme that belongs to the workspace', async () => {
    listCurriculumMock.mockResolvedValue({ data: { programme: 12, topics: [] } })

    render(<MemoryRouter initialEntries={["/student/lectures"]}><Probe options={{ preferredProgrammes: [12, 'dgnl'] }} /></MemoryRouter>)

    await waitFor(() => expect(listCurriculumMock).toHaveBeenCalledWith('student-token', 12))
    expect(screen.getByTestId('programme')).toHaveTextContent('12')
  })

  it('can skip lesson detail loading when list responses already carry units', async () => {
    listCurriculumMock.mockResolvedValue({
      data: {
        programme: 10,
        topics: [{ id: 1, title: 'Topic', lessons: [{ id: 12, title: 'Lesson', unit_count: 1 }] }],
      },
    })

    render(<MemoryRouter initialEntries={["/student/lectures?programme=10&topic=1&lesson=12"]}><Probe options={{ skipLessonDetail: true }} /></MemoryRouter>)

    await waitFor(() => expect(screen.getByTestId('selectedLesson')).toHaveTextContent('Lesson'))
    expect(getCurriculumLessonMock).not.toHaveBeenCalled()
  })

  it('reload rejects failures to callers', async () => {
    listCurriculumMock
      .mockResolvedValueOnce({ data: { programme: 10, topics: [] } })
      .mockRejectedValueOnce(new Error('Reload failed'))

    render(<MemoryRouter initialEntries={["/student/lectures?programme=10"]}><Probe /></MemoryRouter>)
    await waitFor(() => expect(listCurriculumMock).toHaveBeenCalledTimes(1))

    await act(async () => {
      screen.getByRole('button', { name: 'Reload' }).click()
    })
    await waitFor(() => expect(window.__reloadError).toBe('Reload failed'))
  })

  it('resolves a lesson through its actual parent instead of a conflicting topic URL', async () => {
    listCurriculumMock.mockResolvedValue({ data: { programme: 10, topics: [
      { id: 1, title: 'First', lessons: [] },
      { id: 2, title: 'Second', lessons: [{ id: 12, title: 'Correct lesson' }] },
    ] } })
    getCurriculumLessonMock.mockResolvedValue({ data: { lesson: { id: 12 }, units: [] } })
    render(<MemoryRouter initialEntries={['/student/lectures?programme=10&topic=1&lesson=12']}><Probe /></MemoryRouter>)
    await waitFor(() => expect(screen.getByTestId('selectedLesson')).toHaveTextContent('Correct lesson'))
    expect(getCurriculumLessonMock).toHaveBeenCalledWith('student-token', 12)
  })

  it('uses the current site workspace when guests have no authenticated workspace', async () => {
    listCurriculumMock.mockResolvedValue({ data: { programme: 'thpt', topics: [] } })

    render(<MemoryRouter initialEntries={["/lectures?programme=thpt"]}><Probe token={null} workspace={null} /></MemoryRouter>)

    expect(await screen.findByTestId('programmes')).toHaveTextContent('10,11,12,thpt,dgnl')
    expect(listCurriculumMock).toHaveBeenCalledWith(null, 'thpt')
  })
})
