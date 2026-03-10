import { describe, it, expect } from 'vitest'
import { isValidVietnamPhone, parseJwtDuration } from './auth.js'

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
