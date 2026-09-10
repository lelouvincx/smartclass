import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyApiRelease } from './release-api.mjs'

const commit = 'a'.repeat(40)
function responder(mode, change = () => {}) {
  return async (input, options) => {
    assert.equal(options.redirect, 'error')
    assert.equal(options.method, 'GET')
    const url = new URL(input)
    let status = 200
    let body = { success: true, data: [] }
    if (url.pathname === '/api/health') body.data = { service: 'smartclass-api', environment: 'production', maintenance: mode === 'closed' }
    else if (url.pathname === '/api/version') body.data = { commit }
    else if (mode === 'closed') { status = 503; body = { success: false, error: { code: 'MAINTENANCE' } } }
    else if (url.pathname === '/api/auth/me') { status = 401; body = { success: false, error: { code: 'UNAUTHORIZED' } } }
    const response = { status, body }
    change(url, response)
    return Response.json(response.body, { status: response.status })
  }
}

test('checks closed and open API states on both hosts using reads only', async () => {
  for (const mode of ['closed', 'open']) await verifyApiRelease(mode, commit, responder(mode))
})

test('rejects an English host with the wrong version even when Maths passes', async () => {
  await assert.rejects(verifyApiRelease('closed', commit, responder('closed', (url, response) => {
    if (url.hostname === 'api.tienganhcothuy.com' && url.pathname === '/api/version') response.body.data.commit = 'b'.repeat(40)
  })), /version/)
})

test('does not mistake application rejection or a lying health flag for maintenance', async () => {
  for (const status of [200, 401, 403, 404]) {
    await assert.rejects(verifyApiRelease('closed', commit, responder('closed', (url, response) => {
      if (url.pathname === '/api/lectures') response.status = status
    })), /maintenance/)
  }
})

test('rejects a mixed-workspace guest response and invalid CLI values', async () => {
  await assert.rejects(verifyApiRelease('open', commit, responder('open', (url, response) => {
    if (url.hostname === 'api.tienganhcothuy.com' && url.pathname === '/api/lectures') response.body.data = [{ workspace_id: 'maths' }]
  })), /workspace/)
  await assert.rejects(verifyApiRelease('maybe', commit, responder('open')), /mode/)
  await assert.rejects(verifyApiRelease('closed', 'main', responder('closed')), /commit/)
})
