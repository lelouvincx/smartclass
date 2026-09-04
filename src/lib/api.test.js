import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSubmission, getSubmissionExercisePdf } from './api'

describe('API errors', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retains the HTTP status and API error code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'NOT_FOUND', message: 'Submission not found' },
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })))

    await expect(getSubmission('token', 10)).rejects.toMatchObject({
      message: 'Submission not found',
      status: 404,
      code: 'NOT_FOUND',
    })
  })

  it('replaces browser network errors with an actionable message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(getSubmission('token', 10)).rejects.toThrow(
      'SmartClass can’t reach the server right now. Try again in a moment.',
    )
  })

  it('downloads the source PDF through the owned submission', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('pdf', {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await getSubmissionExercisePdf('student-token', 10)

    expect(result).toBeInstanceOf(Blob)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8787/api/submissions/10/exercise-pdf',
      { headers: { Authorization: 'Bearer student-token' } },
    )
  })
})
