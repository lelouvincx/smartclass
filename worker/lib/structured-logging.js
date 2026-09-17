import { routePath } from 'hono/route'
import { BUILD_COMMIT } from '../version.js'

const LOG_SCHEMA_VERSION = 1

function structuredLogsEnabled(c) {
  return c.env.APP_STRUCTURED_LOGS === 'true'
}

function workspaceId(c) {
  return c.get('workspace')?.id ?? null
}

function routeTemplate(c) {
  const path = routePath(c)
  if (!path || path === '*' || path.endsWith('/*')) return 'unmatched'
  return path
}

function baseRecord(c, event) {
  return {
    schema_version: LOG_SCHEMA_VERSION,
    event,
    timestamp: new Date().toISOString(),
    workspace_id: workspaceId(c),
    commit: c.env.APP_COMMIT_SHA || BUILD_COMMIT,
  }
}

function errorType(error) {
  if (!error) return undefined
  if (typeof error.name === 'string' && error.name.trim()) return error.name
  return 'Error'
}

export async function requestLogging(c, next) {
  const start = performance.now()
  await next()

  if (!structuredLogsEnabled(c)) return

  const status = c.res.status
  const errorCode = c.get('responseErrorCode')
  const record = {
    ...baseRecord(c, 'http.request.completed'),
    method: c.req.method,
    route: routeTemplate(c),
    status,
    handler_duration_ms: Math.max(0, Math.round(performance.now() - start)),
    ...(errorCode ? { error_code: errorCode } : {}),
    ...(c.error ? { exception_type: errorType(c.error) } : {}),
  }
  const level = status >= 500 && errorCode !== 'MAINTENANCE' ? 'error' : 'info'
  console[level](record)
}

export function logOperation(c, event, fields = {}, level = 'info', options = {}) {
  if (!options.always && !structuredLogsEnabled(c)) return
  console[level]({
    ...baseRecord(c, event),
    ...fields,
  })
}

export function exceptionFields(error) {
  return { error_type: errorType(error) }
}
