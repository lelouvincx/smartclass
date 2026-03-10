import { describe, it, expect, vi } from 'vitest'
import { jsonError } from './response.js'

describe('jsonError', () => {
  it('returns a JSON error response with correct shape', () => {
    const mockJson = vi.fn()
    const c = { json: mockJson }

    jsonError(c, 400, 'VALIDATION_ERROR', 'Phone is required.')

    expect(mockJson).toHaveBeenCalledWith(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Phone is required.',
        },
      },
      400,
    )
  })
})
