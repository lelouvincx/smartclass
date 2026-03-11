import { describe, it, expect } from 'vitest'
import {
  isValidVietnamPhone,
  parseJwtDuration,
  hashPassword,
  verifyPassword,
  issueAccessToken,
  verifyAccessToken,
} from './auth.js'

describe('isValidVietnamPhone', () => {
  it('accepts valid +84 phone numbers', () => {
    expect(isValidVietnamPhone('+84865481769')).toBe(true)
    expect(isValidVietnamPhone('+841234567890')).toBe(true)
  })

  it('rejects invalid phone numbers', () => {
    expect(isValidVietnamPhone('')).toBe(false)
    expect(isValidVietnamPhone('0865481769')).toBe(false)
    expect(isValidVietnamPhone('+8412345')).toBe(false)
    expect(isValidVietnamPhone('+85865481769')).toBe(false)
    expect(isValidVietnamPhone('abc')).toBe(false)
  })
})

describe('parseJwtDuration', () => {
  it('returns default 7 days when no value is provided', () => {
    expect(parseJwtDuration(undefined)).toBe(7 * 86400)
    expect(parseJwtDuration(null)).toBe(7 * 86400)
    expect(parseJwtDuration('')).toBe(7 * 86400)
  })

  it('parses seconds', () => {
    expect(parseJwtDuration('30s')).toBe(30)
  })

  it('parses minutes', () => {
    expect(parseJwtDuration('15m')).toBe(15 * 60)
  })

  it('parses hours', () => {
    expect(parseJwtDuration('2h')).toBe(2 * 3600)
  })

  it('parses days', () => {
    expect(parseJwtDuration('7d')).toBe(7 * 86400)
  })

  it('returns default for invalid formats', () => {
    expect(parseJwtDuration('abc')).toBe(7 * 86400)
    expect(parseJwtDuration('10x')).toBe(7 * 86400)
    expect(parseJwtDuration('10')).toBe(7 * 86400)
  })
})

describe('password hashing', () => {
  it('hashes passwords correctly', async () => {
    const password = 'test123'
    const hash = await hashPassword(password)

    expect(hash).toBeTruthy()
    expect(hash).not.toBe(password)
    expect(hash).toMatch(/^\$2[aby]\$/) // bcrypt hash format
  })

  it('generates different hashes for same password', async () => {
    const password = 'test123'
    const hash1 = await hashPassword(password)
    const hash2 = await hashPassword(password)

    expect(hash1).not.toBe(hash2) // Different salts
  })

  it('verifies correct password', async () => {
    const password = 'correct-password'
    const hash = await hashPassword(password)

    const result = await verifyPassword(password, hash)
    expect(result).toBe(true)
  })

  it('rejects incorrect password', async () => {
    const password = 'correct-password'
    const hash = await hashPassword(password)

    const result = await verifyPassword('wrong-password', hash)
    expect(result).toBe(false)
  })
})

describe('JWT token operations', () => {
  const mockEnv = {
    JWT_SECRET: 'test-secret-key-for-vitest',
    JWT_EXPIRES_IN: '1h',
  }

  it('issues access token with correct payload', async () => {
    const user = {
      id: 1,
      role: 'teacher',
      phone: '+84865481769',
    }

    const token = await issueAccessToken(mockEnv, user)

    expect(token).toBeTruthy()
    expect(typeof token).toBe('string')
    expect(token.split('.')).toHaveLength(3) // JWT format
  })

  it('verifies valid token and returns payload', async () => {
    const user = {
      id: 1,
      role: 'teacher',
      phone: '+84865481769',
    }

    const token = await issueAccessToken(mockEnv, user)
    const payload = await verifyAccessToken(token, mockEnv)

    expect(payload.sub).toBe('1')
    expect(payload.role).toBe('teacher')
    expect(payload.phone).toBe('+84865481769')
    expect(payload.iat).toBeTruthy()
    expect(payload.exp).toBeTruthy()
  })

  it('rejects invalid token', async () => {
    await expect(
      verifyAccessToken('invalid-token', mockEnv)
    ).rejects.toThrow()
  })

  it('rejects token with wrong secret', async () => {
    const user = { id: 1, role: 'teacher', phone: '+84865481769' }
    const token = await issueAccessToken(mockEnv, user)

    const wrongEnv = { ...mockEnv, JWT_SECRET: 'wrong-secret' }

    await expect(
      verifyAccessToken(token, wrongEnv)
    ).rejects.toThrow()
  })

  it('respects custom expiration time', async () => {
    const customEnv = {
      JWT_SECRET: 'test-secret',
      JWT_EXPIRES_IN: '30s',
    }

    const user = { id: 1, role: 'student', phone: '+84900000001' }
    const token = await issueAccessToken(customEnv, user)
    const payload = await verifyAccessToken(token, customEnv)

    const expiresIn = payload.exp - payload.iat
    expect(expiresIn).toBe(30)
  })
})
