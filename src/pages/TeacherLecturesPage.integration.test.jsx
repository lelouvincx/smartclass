import React from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_TOKEN_KEY } from '@/lib/auth'
import { AuthProvider } from '@/lib/auth-context'
import TeacherLecturesPage from './TeacherLecturesPage'

const API_ORIGIN = 'http://maths-api.test'

const teacherEnvelope = {
  user: { id: 1, role: 'teacher', name: 'Teacher' },
  workspace: { id: 'maths', api_origin: API_ORIGIN, frontend_origin: 'http://maths.test' },
  membership: { role: 'teacher', status: 'active' },
}

const topicsByProgramme = {
  10: [
    {
      id: 11,
      programme: 10,
      title: 'Algebra',
      order_index: 0,
      lessons: [
        { id: 21, topic_id: 11, title: 'Linear equations', order_index: 0, unit_count: 3 },
        { id: 22, topic_id: 11, title: 'Quadratics', order_index: 1, unit_count: 0 },
      ],
    },
    { id: 12, programme: 10, title: 'Geometry', order_index: 1, lessons: [] },
  ],
  11: [{ id: 31, programme: 11, title: 'Sequences', order_index: 0, lessons: [] }],
  12: [{ id: 41, programme: 12, title: 'Calculus', order_index: 0, lessons: [] }],
  thpt: [{ id: 51, programme: 'thpt', title: 'THPT review', order_index: 0, lessons: [] }],
  dgnl: [{ id: 61, programme: 'dgnl', title: 'ĐGNL review', order_index: 0, lessons: [] }],
}

const unitsByPlacement = {
  101: { placement_id: 101, order_index: 0, lecture: { id: 1, title: 'Shared line', youtube_url: 'https://youtu.be/abcdefghijk', is_visible: 1, minimum_access_tier: 'standard' } },
  102: { placement_id: 102, order_index: 1, lecture: { id: 2, title: 'Hidden slope', youtube_url: 'https://youtu.be/lmnopqrstuv', is_visible: 0, minimum_access_tier: 'vip' } },
  103: { placement_id: 103, order_index: 2, lecture: { id: 3, title: 'Guest intro', youtube_url: 'https://youtu.be/zyxwvutsrqp', is_visible: 1, minimum_access_tier: 'guest' } },
}

const library = [
  {
    id: 1,
    title: 'Shared line',
    youtube_url: 'https://youtu.be/abcdefghijk',
    is_visible: 1,
    minimum_access_tier: 'standard',
    placements: [{ placement_id: 101, lesson_id: 21, lesson_title: 'Linear equations', topic_id: 11, topic_title: 'Algebra', programme: 10 }],
  },
  {
    id: 2,
    title: 'Hidden slope',
    youtube_url: 'https://youtu.be/lmnopqrstuv',
    is_visible: 0,
    minimum_access_tier: 'vip',
    placements: [{ placement_id: 102, lesson_id: 21, lesson_title: 'Linear equations', topic_id: 11, topic_title: 'Algebra', programme: 10 }],
  },
  {
    id: 3,
    title: 'Guest intro',
    youtube_url: 'https://youtu.be/zyxwvutsrqp',
    is_visible: 1,
    minimum_access_tier: 'guest',
    placements: [{ placement_id: 103, lesson_id: 21, lesson_title: 'Linear equations', topic_id: 11, topic_title: 'Algebra', programme: 10 }],
  },
  { id: 4, title: 'Unplaced library video', youtube_url: 'https://youtu.be/aaaaaaaaaaa', is_visible: 1, minimum_access_tier: 'standard', placements: [] },
]

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function installApiFixture({ failLessonRename = false } = {}) {
  let revision = 8
  let unitOrder = [101, 102, 103]
  const calls = []
  const fetchMock = vi.fn(async (url, options = {}) => {
    const parsed = new URL(url)
    const body = options.body ? JSON.parse(options.body) : undefined
    calls.push({ method: options.method ?? 'GET', path: parsed.pathname, search: parsed.search, body })

    if (parsed.pathname === '/api/auth/me') return jsonResponse({ data: teacherEnvelope })
    if (parsed.pathname === '/api/lectures') return jsonResponse({ data: { revision, lectures: library } })
    if (parsed.pathname === '/api/curriculum') {
      const programme = parsed.searchParams.get('programme')
      return jsonResponse({ data: { programme: /^\d+$/.test(programme) ? Number(programme) : programme, revision, topics: topicsByProgramme[programme] ?? [] } })
    }
    if (parsed.pathname === '/api/curriculum/lessons/21' && (!options.method || options.method === 'GET')) {
      return jsonResponse({ data: { revision, lesson: { id: 21, topic_id: 11, title: 'Linear equations' }, units: unitOrder.map((id, index) => ({ ...unitsByPlacement[id], order_index: index })) } })
    }
    if (parsed.pathname === '/api/curriculum/order' && options.method === 'PUT') {
      revision = 9
      unitOrder = body.ids
      return jsonResponse({ data: { revision } })
    }
    if (parsed.pathname === '/api/curriculum/lessons/21' && options.method === 'PUT') {
      if (failLessonRename) return jsonResponse({ error: { message: 'Save failed for test', code: 'TEST_SAVE_FAILED' } }, 500)
      revision = 9
      return jsonResponse({ data: { revision } })
    }
    return jsonResponse({ error: { message: `Unhandled test request: ${options.method ?? 'GET'} ${parsed.pathname}${parsed.search}` } }, 500)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

function renderPage() {
  localStorage.setItem(AUTH_TOKEN_KEY, 'teacher-token')
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/teacher/lectures?programme=10&lesson=21']}>
        <TeacherLecturesPage />
      </MemoryRouter>
    </AuthProvider>,
  )
}

function requestCalls(calls, method, path) {
  return calls.filter((call) => call.method === method && call.path === path)
}

function getMobileLessonActions() {
  return within(screen.getByTestId('curriculum-mobile-lesson-actions'))
}

describe('TeacherLecturesPage integrated curriculum management', () => {
  beforeEach(() => {
    localStorage.clear()
    Element.prototype.hasPointerCapture ??= () => false
    Element.prototype.setPointerCapture ??= () => {}
    Element.prototype.releasePointerCapture ??= () => {}
    Element.prototype.scrollIntoView ??= () => {}
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders the URL-selected lesson through the real hook and navigator with real units and programme choices', async () => {
    installApiFixture()
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Linear equations' })).toBeInTheDocument()
    const programme = screen.getByLabelText('Programme')
    expect(programme).toHaveTextContent('Grade 10')
    programme.focus()
    const user = userEvent.setup()
    await user.keyboard('{Enter}')
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Grade 10', 'Grade 11', 'Grade 12', 'THPT', 'ĐGNL'])
    await user.keyboard('{Escape}')

    const units = await screen.findByRole('list', { name: 'Units in Linear equations' })
    expect(within(units).getByText('Shared line')).toBeInTheDocument()
    expect(within(units).getByText('Hidden slope')).toBeInTheDocument()
    expect(within(units).getByText('Guest intro')).toBeInTheDocument()
    expect(within(units).getByText('Hidden')).toBeInTheDocument()
  })

  it('saves a complete revision-bearing unit order and refreshes from the API', async () => {
    const { calls } = installApiFixture()
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Guest intro')
    await user.click(getMobileLessonActions().getByRole('button', { name: 'Lesson actions for Linear equations' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Reorder units' }))
    await user.click(await screen.findByRole('button', { name: 'Move Guest intro up' }))
    await user.click(screen.getByRole('button', { name: 'Save order' }))

    await waitFor(() => expect(requestCalls(calls, 'PUT', '/api/curriculum/order')).toHaveLength(1))
    expect(requestCalls(calls, 'PUT', '/api/curriculum/order')[0].body).toEqual({
      parent_type: 'lesson',
      parent_id: 21,
      ids: [101, 103, 102],
      expected_revision: 8,
    })

    await waitFor(() => {
      expect(requestCalls(calls, 'GET', '/api/curriculum').filter((call) => call.search === '?programme=10').length).toBeGreaterThan(1)
      expect(requestCalls(calls, 'GET', '/api/lectures').length).toBeGreaterThan(1)
      expect(requestCalls(calls, 'GET', '/api/curriculum/lessons/21').length).toBeGreaterThan(1)
    })
    const unitItems = within(screen.getByRole('list', { name: 'Units in Linear equations' })).getAllByRole('listitem')
    expect(unitItems.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Shared line'),
      expect.stringContaining('Guest intro'),
      expect.stringContaining('Hidden slope'),
    ])
  })

  it('keeps a failed rename editor open with the draft value intact', async () => {
    installApiFixture({ failLessonRename: true })
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('heading', { name: 'Linear equations' })
    await user.click(getMobileLessonActions().getByRole('button', { name: 'Lesson actions for Linear equations' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    const title = await screen.findByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Linear equations draft')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed for test')
    expect(screen.getByDisplayValue('Linear equations draft')).toBeInTheDocument()
  })
})
