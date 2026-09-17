import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyApiRelease } from './release-api.mjs'

const commit = 'a'.repeat(40)
const allowedProgrammes = {
  'api.toanthaythanh.com': ['10', '11', '12', 'thpt', 'dgnl'],
  'api.tienganhcothuy.com': ['10', '11', '12', 'dgnl'],
}

function programmeValue(value) {
  return ['10', '11', '12'].includes(value) ? Number(value) : value
}

function responder(mode, change = () => {}) {
  return async (input, options) => {
    assert.equal(options.redirect, 'error')
    assert.equal(options.method, 'GET')
    const url = new URL(input)
    let status = 200
    let body = { success: true, data: { topics: [] } }
    if (url.pathname === '/api/health') body.data = { service: 'smartclass-api', environment: 'production', maintenance: mode === 'closed' }
    else if (url.pathname === '/api/version') body.data = { commit }
    else if (mode === 'closed') { status = 503; body = { success: false, error: { code: 'MAINTENANCE' } } }
    else if (url.pathname === '/api/curriculum') {
      assert.ok(allowedProgrammes[url.hostname].includes(url.searchParams.get('programme')))
      body.data = { programme: programmeValue(url.searchParams.get('programme')), topics: [] }
    }
    else if (url.pathname === '/api/public/exercises') body.data = []
    else if (url.pathname === '/api/lectures') { status = 401; body = { success: false, error: { code: 'UNAUTHORIZED' } } }
    else if (url.pathname === '/api/auth/me') { status = 401; body = { success: false, error: { code: 'UNAUTHORIZED' } } }
    const response = { status, body }
    change(url, response)
    return Response.json(response.body, { status: response.status })
  }
}

test('checks closed and open API states on both hosts using reads only', async () => {
  const calls = []
  for (const mode of ['closed', 'open']) {
    await verifyApiRelease(mode, commit, async (input, options) => {
      calls.push([mode, new URL(input).pathname, new URL(input).searchParams.get('programme'), options.method])
      return responder(mode)(input, options)
    })
  }
  assert.equal(calls.every(([, , , method]) => method === 'GET'), true)
  assert.equal(calls.filter(([, path]) => path === '/api/health').length, 4)
  assert.equal(calls.filter(([, path]) => path === '/api/version').length, 4)
  assert.equal(calls.filter(([, path]) => path === '/api/public/exercises').length, 4)
  assert.equal(calls.filter(([mode, path]) => mode === 'open' && path === '/api/curriculum').length, 9)
})

test('rejects an English host with the wrong version even when Maths passes', async () => {
  await assert.rejects(verifyApiRelease('closed', commit, responder('closed', (url, response) => {
    if (url.hostname === 'api.tienganhcothuy.com' && url.pathname === '/api/version') response.body.data.commit = 'b'.repeat(40)
  })), /version/)
})

test('does not mistake application rejection or a lying health flag for maintenance', async () => {
  for (const status of [200, 401, 403, 404]) {
    await assert.rejects(verifyApiRelease('closed', commit, responder('closed', (url, response) => {
      if (url.pathname === '/api/curriculum') response.status = status
    })), /maintenance/)
  }
})

test('rejects malformed successful curriculum data, wrong programmes, redirects, and invalid CLI values', async () => {
  await assert.rejects(verifyApiRelease('open', commit, responder('open', (url, response) => {
    if (url.hostname === 'api.tienganhcothuy.com' && url.pathname === '/api/curriculum' && url.searchParams.get('programme') === '10') {
      response.body.data = { programme: 11, topics: [] }
    }
  })), /curriculum/)
  await assert.rejects(verifyApiRelease('open', commit, responder('open', (url, response) => {
    if (url.hostname === 'api.toanthaythanh.com' && url.pathname === '/api/curriculum' && url.searchParams.get('programme') === 'thpt') {
      response.body.data = { programme: 'thpt', topics: {} }
    }
  })), /curriculum/)
  await assert.rejects(verifyApiRelease('open', commit, responder('open', (url, response) => {
    if (url.pathname === '/api/public/exercises') response.body.data = {}
  })), /public\/exercises/)
  await assert.rejects(verifyApiRelease('open', commit, async (input, options) => {
    if (new URL(input).pathname === '/api/version') throw new TypeError('redirect not allowed')
    return responder('open')(input, options)
  }), /redirect|version|fetch/i)
  await assert.rejects(verifyApiRelease('maybe', commit, responder('open')), /mode/)
  await assert.rejects(verifyApiRelease('closed', 'main', responder('closed')), /commit/)
})

test('keeps management and account endpoints denied to anonymous users after reopening', async () => {
  for (const path of ['/api/lectures', '/api/auth/me']) {
    await assert.rejects(verifyApiRelease('open', commit, responder('open', (url, response) => {
      if (url.pathname === path) { response.status = 200; response.body = { success: true, data: {} } }
    })), new RegExp(path.replaceAll('/', '\\/')))
  }
})
