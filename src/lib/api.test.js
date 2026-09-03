import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSubmission } from './api'

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
      'Couldn’t connect to SmartClass. Check your internet connection and try again.',
    )
  })
})
