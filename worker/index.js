import { Hono } from 'hono'
import { requireWorkspace } from './middleware/workspace.js'
import authRoutes from './routes/workspace-auth.js'
import usersRoutes from './routes/workspace-users.js'
import exercisesRoutes from './routes/workspace-exercises.js'
import questionAssetsRoutes from './routes/workspace-question-assets.js'
import questionAssetFilesRoutes from './routes/workspace-question-asset-files.js'
import uploadRoutes from './routes/workspace-upload.js'
import submissionsRoutes from './routes/workspace-submissions.js'
import filesRoutes from './routes/workspace-files.js'
import lecturesRoutes from './routes/workspace-lectures.js'
import { jsonError, jsonSuccess } from './lib/response.js'
import { getWorkspaceSites } from './lib/workspaces.js'
import { BUILD_COMMIT } from './version.js'

const app = new Hono()

app.use('*', async (c, next) => {
  const url = new URL(c.req.url)
  const diagnostic = c.req.method === 'GET' && ['/api/health', '/api/version'].includes(url.pathname)
  if (c.env.APP_MAINTENANCE !== 'true' || diagnostic) return next()

  c.header('Cache-Control', 'no-store')
  c.header('Retry-After', '60')
  c.header('Vary', 'Origin')
  const site = getWorkspaceSites(c.env).find((candidate) => candidate.api_origin === url.origin)
  if (site && c.req.header('Origin') === site.frontend_origin) {
    c.header('Access-Control-Allow-Origin', site.frontend_origin)
    c.header('Access-Control-Allow-Credentials', 'true')
  }
  return jsonError(c, 503, 'MAINTENANCE', 'SmartClass is temporarily unavailable for maintenance. Please try again shortly.')
})

app.use('/api/*', requireWorkspace)

app.get('/api/health', (c) => {
  return jsonSuccess(c, {
    service: 'smartclass-api',
    environment: c.env.APP_ENV || 'development',
    maintenance: c.env.APP_MAINTENANCE === 'true',
    timestamp: new Date().toISOString(),
  })
})

app.get('/api/version', (c) => {
  c.header('Cache-Control', 'no-store')

  return jsonSuccess(c, {
    commit: c.env.APP_COMMIT_SHA || BUILD_COMMIT,
  })
})

app.route('/api/auth', authRoutes)
app.route('/api/users', usersRoutes)
app.route('/api/exercises', exercisesRoutes)
app.route('/api/exercises', questionAssetsRoutes)
app.route('/api/question-assets', questionAssetFilesRoutes)
app.route('/api/upload', uploadRoutes)
app.route('/api/submissions', submissionsRoutes)
app.route('/api/files', filesRoutes)
app.route('/api/lectures', lecturesRoutes)

app.onError((error, c) => {
  console.error('Unhandled worker error:', error)

  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Something went wrong. Please try again later.',
      },
    },
    500,
  )
})

app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
      },
    },
    404,
  )
})

export default app
