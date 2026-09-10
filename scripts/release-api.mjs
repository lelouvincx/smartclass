import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { getWorkspaceSites } from '../worker/lib/workspaces.js'

export async function verifyApiRelease(mode, commit, request = fetch) {
  if (!['closed', 'open'].includes(mode)) throw new Error('Release mode must be closed or open')
  if (!/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('Expected a full release commit')
  for (const site of getWorkspaceSites({ APP_ENV: 'production' })) {
    for (const path of ['/api/health', '/api/version', '/api/lectures', '/api/auth/me']) {
      const response = await request(`${site.api_origin}${path}`, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10_000),
        headers: { 'Cache-Control': 'no-cache', Origin: site.frontend_origin },
      })
      const body = await response.json()
      let valid
      if (path === '/api/health') {
        valid = response.status === 200 && body.success === true
          && body.data?.service === 'smartclass-api' && body.data?.environment === 'production'
          && body.data?.maintenance === (mode === 'closed')
      } else if (path === '/api/version') {
        valid = response.status === 200 && body.success === true && body.data?.commit === commit
      } else if (mode === 'closed') {
        valid = response.status === 503 && body.error?.code === 'MAINTENANCE'
      } else if (path === '/api/lectures') {
        valid = response.status === 200 && body.success === true && Array.isArray(body.data)
          && body.data.every((lecture) => lecture.workspace_id === site.id)
      } else {
        valid = response.status === 401 && body.error?.code === 'UNAUTHORIZED'
      }
      if (!valid) throw new Error(`${site.id} ${path}: ${mode} maintenance/version/workspace check failed`)
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
