import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { getWorkspaceSites } from '../worker/lib/workspaces.js'

const PROGRAMMES_BY_SITE = Object.freeze({
  maths: ['10', '11', '12', 'thpt', 'dgnl'],
  english: ['10', '11', '12', 'dgnl'],
})

function programmeValue(value) {
  return ['10', '11', '12'].includes(value) ? Number(value) : value
}

function releaseProbes(site) {
  return [
    { path: '/api/health', kind: 'health' },
    { path: '/api/version', kind: 'version' },
    ...(PROGRAMMES_BY_SITE[site.id] ?? []).map((programme) => ({
      path: `/api/curriculum?programme=${programme}`,
      kind: 'curriculum',
      programme,
    })),
    { path: '/api/lectures', kind: 'anonymous-denied' },
    { path: '/api/auth/me', kind: 'anonymous-denied' },
  ]
}

function validateProbe({ mode, commit, site, probe, response, body }) {
  if (probe.kind === 'health') {
    return response.status === 200 && body.success === true
      && body.data?.service === 'smartclass-api' && body.data?.environment === 'production'
      && body.data?.maintenance === (mode === 'closed')
  }
  if (probe.kind === 'version') {
    return response.status === 200 && body.success === true && body.data?.commit === commit
  }
  if (mode === 'closed') {
    return response.status === 503 && body.success === false && body.error?.code === 'MAINTENANCE'
  }
  if (probe.kind === 'curriculum') {
    return response.status === 200 && body.success === true
      && body.data?.programme === programmeValue(probe.programme)
      && Array.isArray(body.data?.topics)
  }
  if (probe.kind === 'anonymous-denied') {
    return response.status === 401 && body.success === false && body.error?.code === 'UNAUTHORIZED'
  }
  throw new Error(`${site.id} ${probe.path}: unknown release probe`)
}

export async function verifyApiRelease(mode, commit, request = fetch) {
  if (!['closed', 'open'].includes(mode)) throw new Error('Release mode must be closed or open')
  if (!/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('Expected a full release commit')
  for (const site of getWorkspaceSites({ APP_ENV: 'production' })) {
    for (const probe of releaseProbes(site)) {
      const response = await request(`${site.api_origin}${probe.path}`, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10_000),
        headers: { 'Cache-Control': 'no-cache', Origin: site.frontend_origin },
      })
      const body = await response.json()
      if (!validateProbe({ mode, commit, site, probe, response, body })) {
        throw new Error(`${site.id} ${probe.path}: ${mode} maintenance/version/curriculum/auth check failed`)
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, commit] = process.argv.slice(2)
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await verifyApiRelease(mode, commit)
        break
      } catch (error) {
        if (attempt >= 11 || !['closed', 'open'].includes(mode) || !/^[a-f0-9]{40}$/.test(commit ?? '')) throw error
        await delay(5_000)
      }
    }
    console.log(`Both API sites verified ${mode} at ${commit}.`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
