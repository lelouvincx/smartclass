import { describe, expect, it } from 'vitest'
import app from './index.js'
import { createMockEnv } from './test/setup.js'

describe('GET /api/version', () => {
  it('returns the deployed commit hash', async () => {
    const env = createMockEnv({ APP_COMMIT_SHA: '0123456789abcdef0123456789abcdef01234567' })

    const response = await app.request('/api/version', {}, env)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({
      success: true,
      data: {
        commit: '0123456789abcdef0123456789abcdef01234567',
      },
    })
  })
})
