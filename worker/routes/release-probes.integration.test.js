import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import app from '../index.js'
import { verifyApiRelease } from '../../scripts/release-api.mjs'

const commit = '0123456789abcdef0123456789abcdef01234567'

function mountedRequest(mode) {
  return async (input, options) => {
    expect(options.redirect).toBe('error')
    const bindings = {
      ...env,
      APP_ENV: 'production',
      APP_MAINTENANCE: mode === 'closed' ? 'true' : 'false',
      APP_COMMIT_SHA: commit,
    }
    const { redirect: _redirect, ...requestOptions } = options
    return app.request(input, requestOptions, bindings)
  }
}

describe('release API probes against the mounted worker app', () => {
  it('verifies closed and open production host probes without network fetches', async () => {
    await expect(verifyApiRelease('closed', commit, mountedRequest('closed'))).resolves.toBeUndefined()
    await expect(verifyApiRelease('open', commit, mountedRequest('open'))).resolves.toBeUndefined()
  })
})
