import { describe, it, expect, vi } from 'vitest'
import { jsonSuccess, jsonError } from './response.js'

describe('jsonSuccess', () => {
  it('returns a JSON success response with data', () => {
    const mockJson = vi.fn()
    const c = { json: mockJson }

    jsonSuccess(c, { id: 1, title: 'Test' })

    expect(mockJson).toHaveBeenCalledWith(
      {
        success: true,
        data: { id: 1, title: 'Test' },
      },
      200,
    )
  })

  it('returns a JSON success response with custom status', () => {
    const mockJson = vi.fn()
    const c = { json: mockJson }

    jsonSuccess(c, { id: 1 }, 201)

    expect(mockJson).toHaveBeenCalledWith(
      {
        success: true,
        data: { id: 1 },
      },
      201,
    )
  })
})

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

  it('returns a JSON error response with different status codes', () => {
    const mockJson = vi.fn()
    const c = { json: mockJson }

    jsonError(c, 404, 'NOT_FOUND', 'Resource not found')

    expect(mockJson).toHaveBeenCalledWith(
      {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Resource not found',
        },
      },
      404,
    )
  })
})
