import { describe, expect, it } from 'vitest'
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatFullDate,
  formatRelativeTime,
  formatTime,
} from './format'

describe('localized formatters', () => {
  it('formats durations in the selected language', () => {
    expect(formatDuration(60, 'en')).toBe('60 min')
    expect(formatDuration(60, 'vi')).toBe('60 phút')
  })

  it('formats relative times in the selected language', () => {
    const now = new Date('2026-09-03T12:00:00Z')
    const value = new Date('2026-09-03T10:00:00Z')

    expect(formatRelativeTime(value, 'en', now)).toBe('2 hours ago')
    expect(formatRelativeTime(value, 'vi', now)).toBe('2 giờ trước')
  })

  it('preserves just-now and day-relative submission dates', () => {
    const now = new Date('2026-09-03T12:00:00Z')

    expect(formatRelativeTime(new Date('2026-09-03T11:59:45Z'), 'en', now)).toBe('just now')
    expect(formatRelativeTime(new Date('2026-09-03T11:59:45Z'), 'vi', now)).toBe('vừa xong')
    expect(formatRelativeTime(new Date('2026-09-01T11:00:00Z'), 'en', now)).toBe('2 days ago')
    expect(formatRelativeTime(new Date('2026-09-01T11:00:00Z'), 'vi', now)).toBe('2 ngày trước')
  })

  it('uses locale-specific date ordering without forcing a timezone', () => {
    const value = new Date(2026, 8, 3, 14, 5)

    expect(formatDate(value, 'en')).toMatch(/Sep 3/)
    expect(formatDate(value, 'vi')).toMatch(/3 thg 9/)
    expect(formatFullDate(value, 'en')).toMatch(/09\/03\/2026/)
    expect(formatFullDate(value, 'vi')).toMatch(/03\/09\/2026/)
    expect(formatDateTime(value, 'en')).toContain('2:05 PM')
    expect(formatDateTime(value, 'vi')).toContain('14:05')
    expect(formatTime(value, 'en')).toMatch(/2:05:00 PM/)
    expect(formatTime(value, 'vi')).toMatch(/14:05:00/)
  })
})
