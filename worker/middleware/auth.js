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
    c.set('authUser', {
      id: Number(payload.sub),
      role: payload.role,
      phone: payload.phone,
    })
    await next()
  } catch {
    return jsonError(c, 401, 'UNAUTHORIZED', 'Token is invalid or expired.')
  }
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
