import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StudentLecturesPage from './StudentLecturesPage'
import { AuthProvider } from '@/lib/auth-context'
import { clearStoredToken, setStoredToken } from '@/lib/auth'

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
        unit_count: 1,
        units: [
          {
            placement_id: 101,
            order_index: 0,
            lecture: { id: 201, title: 'Intro unit', youtube_url: 'https://youtu.be/abcdefghijk', is_visible: 1, minimum_access_tier: 'standard' },
          },
        ],
      },
    ],
  },
]

describe('StudentLecturesPage real request boundary', () => {
  afterEach(() => {
    clearStoredToken()
    vi.unstubAllGlobals()
  })

  it('mounts the real page and navigation hooks while stubbing only fetch', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === 'http://maths-api.test/api/auth/me') {
        return new Response(JSON.stringify({ data: {
          user: { id: 7, platform_role: 'user', disabled_at: null },
          workspace: { id: 'maths' },
          membership: { role: 'student', status: 'active', grades: [12], access_tier: 'standard' },
        } }))
      }
      if (url === 'http://maths-api.test/api/curriculum?programme=12') {
        return new Response(JSON.stringify({ data: { programme: 12, topics } }))
      }
      return new Response(JSON.stringify({ error: { message: `Unexpected ${url}` } }), { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)
    setStoredToken('real-token')

    render(<MemoryRouter initialEntries={["/student/lectures?programme=12"]}><AuthProvider><StudentLecturesPage /></AuthProvider></MemoryRouter>)

    expect(await screen.findByRole('link', { name: 'Watch unit 1: Intro unit' })).toHaveAttribute(
      'href',
      '/student/lectures/201-intro-unit?placement=101',
    )
    expect(fetchMock.mock.calls.map(([url, options]) => [url, options?.headers])).toEqual(expect.arrayContaining([
      ['http://maths-api.test/api/auth/me', { Authorization: 'Bearer real-token' }],
      ['http://maths-api.test/api/curriculum?programme=12', { Authorization: 'Bearer real-token' }],
    ]))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
