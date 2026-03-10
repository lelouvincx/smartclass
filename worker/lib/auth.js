import { sign, verify } from 'hono/jwt'
import bcrypt from 'bcryptjs'

const PHONE_REGEX = /^\+84\d{9,10}$/

const DURATION_TO_SECONDS = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
}

export function isValidVietnamPhone(phone) {
  return PHONE_REGEX.test(phone)
}

export function parseJwtDuration(value) {
  if (!value) {
    return 7 * 86400
  }

  const match = String(value).match(/^(\d+)([smhd])$/)
  if (!match) {
    return 7 * 86400
  }

  const amount = Number(match[1])
  const unit = match[2]
  return amount * DURATION_TO_SECONDS[unit]
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash)
}

export async function issueAccessToken(env, user) {
  const now = Math.floor(Date.now() / 1000)
  const expiresInSeconds = parseJwtDuration(env.JWT_EXPIRES_IN || env.JWT_EXPIRE_IN)

  const payload = {
    sub: String(user.id),
    role: user.role,
    phone: user.phone,
    iat: now,
    exp: now + expiresInSeconds,
  }

  return sign(payload, env.JWT_SECRET, 'HS256')
}

export async function verifyAccessToken(token, env) {
  return verify(token, env.JWT_SECRET, 'HS256')
}
