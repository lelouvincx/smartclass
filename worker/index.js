import { Hono } from 'hono'
import { cors } from 'hono/cors'
import authRoutes from './routes/auth.js'
import usersRoutes from './routes/users.js'
import exercisesRoutes from './routes/exercises.js'
import uploadRoutes from './routes/upload.js'
import submissionsRoutes from './routes/submissions.js'

const app = new Hono()

app.use('/api/*', async (c, next) => {
  const allowedOrigin = c.env.APP_CORS_ORIGIN || 'http://localhost:5173'

  return cors({
    origin: (origin) => {
      if (!origin) {
        return allowedOrigin
      }

      return origin === allowedOrigin ? origin : null
    },
    allowHeaders: ['Content-Type', 'Authorization', 'x-r2-key', 'x-file-type', 'x-file-name'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
  })(c, next)
})

app.get('/api/health', (c) => {
  return c.json({
    success: true,
    data: {
      service: 'smartclass-api',
      environment: c.env.APP_ENV || 'development',
      timestamp: new Date().toISOString(),
    },
  })
})

app.route('/api/auth', authRoutes)
app.route('/api/users', usersRoutes)
app.route('/api/exercises', exercisesRoutes)
app.route('/api/upload', uploadRoutes)
app.route('/api/submissions', submissionsRoutes)

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
