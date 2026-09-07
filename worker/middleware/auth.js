import { verifyAccessToken } from '../lib/auth.js'
import { jsonError } from '../lib/response.js'

export async function requireAuth(c, next) {
  if (!c.env.JWT_SECRET) {
    return jsonError(c, 500, 'MISSING_JWT_SECRET', 'Server auth configuration is missing.')
  }

  const authorization = c.req.header('Authorization') || ''
  if (!authorization.startsWith('Bearer ')) {
    return jsonError(c, 401, 'UNAUTHORIZED', 'Missing or invalid authorization token.')
  }

  const token = authorization.slice(7)

  try {
    const payload = await verifyAccessToken(token, c.env)
    const user = await c.env.DB.prepare(
      'SELECT id, phone, role, status FROM users WHERE id = ? LIMIT 1',
    )
      .bind(Number(payload.sub))
      .first()

    if (!user) {
      return jsonError(c, 401, 'UNAUTHORIZED', 'Authenticated user no longer exists.')
    }
    if (user.status === 'pending') {
      return jsonError(c, 403, 'ACCOUNT_PENDING', 'Your account is pending approval.')
    }
    if (user.status === 'disabled') {
      return jsonError(c, 403, 'ACCOUNT_DISABLED', 'Your account has been disabled.')
    }

    c.set('authUser', {
      id: user.id,
      role: user.role,
      phone: user.phone,
      status: user.status,
    })
    await next()
  } catch {
    return jsonError(c, 401, 'UNAUTHORIZED', 'Token is invalid or expired.')
  }
}

export async function optionalAuth(c, next) {
  const authorization = c.req.header('Authorization') || ''
  if (!authorization) {
    await next()
    return
  }

  return requireAuth(c, next)
}

export function requireRole(role) {
  return async (c, next) => {
    const authUser = c.get('authUser')

    if (!authUser || authUser.role !== role) {
      return jsonError(c, 403, 'FORBIDDEN', 'You do not have access to this resource.')
    }

    await next()
  }
}
