import { cors } from 'hono/cors'
import { jsonError } from '../lib/response.js'
import { getWorkspaceSites } from '../lib/workspaces.js'

const CORS_OPTIONS = Object.freeze({
  allowHeaders: ['Content-Type', 'Authorization', 'x-r2-key', 'x-file-type', 'x-file-name'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
})

const WORKSPACE_NEUTRAL_GET_PATHS = new Set(['/api/health', '/api/version'])

function setNoStore(c, value = 'private, no-store') {
  c.header('Cache-Control', value)
}

function varyOrigin(c) {
  c.header('Vary', 'Origin')
}

function isWorkspaceNeutralGet(c) {
  const url = new URL(c.req.url)
  return c.req.method === 'GET' && WORKSPACE_NEUTRAL_GET_PATHS.has(url.pathname)
}

function originHeader(c) {
  if (!c.req.raw.headers.has('Origin')) {
    return { present: false, value: null }
  }

  return { present: true, value: c.req.raw.headers.get('Origin') || '' }
}

export async function requireWorkspace(c, next) {
  varyOrigin(c)

  if (isWorkspaceNeutralGet(c)) {
    setNoStore(c, 'no-store')
    await next()
    setNoStore(c, 'no-store')
    return
  }

  setNoStore(c)

  const requestOrigin = new URL(c.req.url).origin
  const site = getWorkspaceSites(c.env).find((candidate) => candidate.api_origin === requestOrigin)
  if (!site) {
    return jsonError(c, 404, 'UNSUPPORTED_SITE', 'This API host is not supported.')
  }

  const origin = originHeader(c)
  if (origin.present && origin.value !== site.frontend_origin) {
    return jsonError(c, 403, 'ORIGIN_NOT_ALLOWED', 'This browser origin is not allowed for this workspace.')
  }

  c.set('workspace', site)

  return cors({
    origin: site.frontend_origin,
    ...CORS_OPTIONS,
  })(c, async () => {
    await next()
    setNoStore(c)
  })
}
