import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, vi } from 'vitest'
import { AuthProvider } from '@/lib/auth-context'
import { setStoredToken, clearStoredToken } from '@/lib/auth'
import { AppRoutes } from '@/router'

afterEach(() => {
  clearStoredToken()
  vi.unstubAllGlobals()
})

describe('teacher cost dashboard integration', () => {
  it('mounts the real route and API client, stubbing only fetch', async () => {
    setStoredToken('admin-token')
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url === 'http://maths-api.test/api/auth/me') {
        return Promise.resolve(new Response(JSON.stringify({
          data: {
            token: 'admin-token',
            user: { id: 1, name: 'Chinh', phone: '+84865481769', platform_role: 'platform_admin', disabled_at: null },
            workspace: { id: 'maths' },
            membership: null,
            teacher_routing: { action: 'stay' },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      }
      if (url === 'http://maths-api.test/api/cost-analysis/guest-inventory') {
        return Promise.resolve(new Response(JSON.stringify({
          data: {
            version: 1,
            workspace_id: 'maths',
            guest_exercises: [{
              id: 501,
              title: 'Guest algebra',
              question_assets: { count: 2, recorded_bytes: 400 },
              exercise_pdf: { metadata_present: true, recorded_bytes: 1200 },
              schema: { row_count: 2, question_count: 2 },
            }],
            guest_lectures: { public_placed_count: 1 },
            totals: {
              guest_exercise_count: 1,
              question_asset_count: 2,
              question_asset_recorded_bytes: 400,
              exercise_pdf_total_count: 1,
              exercise_pdf_known_count: 1,
              exercise_pdf_recorded_bytes: 1200,
              exercise_pdf_unknown_count: 0,
            },
            notes: ['estimate_not_invoice'],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      }
      return Promise.reject(new Error(`Unexpected request ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/teacher/costs']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    )

    expect(await screen.findByRole('heading', { name: 'Guest cost estimator' })).toBeInTheDocument()
    expect((await screen.findAllByText('Guest algebra')).length).toBeGreaterThan(0)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://maths-api.test/api/cost-analysis/guest-inventory',
      { headers: { Authorization: 'Bearer admin-token' } },
    )
  })
})
