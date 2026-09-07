const LOCALES = {
  en: 'en-US',
  vi: 'vi-VN',
}

function localeFor(language) {
  return LOCALES[language] ?? LOCALES.en
}

function asDate(value) {
  return value instanceof Date ? value : new Date(value)
}

export function formatDuration(minutes, language) {
  const value = new Intl.NumberFormat(localeFor(language)).format(minutes)
  return language === 'vi' ? `${value} phút` : `${value} min`
}

export function formatDate(value, language) {
  return new Intl.DateTimeFormat(localeFor(language), {
    month: 'short',
    day: 'numeric',
  }).format(asDate(value))
}

export function formatFullDate(value, language) {
  return new Intl.DateTimeFormat(localeFor(language), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(asDate(value))
}

export function formatDateTime(value, language) {
  return new Intl.DateTimeFormat(localeFor(language), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(asDate(value))
}

export function formatTime(value, language) {
  return new Intl.DateTimeFormat(localeFor(language), {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(asDate(value))
}

export function formatRelativeTime(value, language, now = new Date()) {
  const date = asDate(value)
  const differenceMs = date.getTime() - asDate(now).getTime()
  const direction = differenceMs < 0 ? -1 : 1
  const differenceSeconds = Math.floor(Math.abs(differenceMs) / 1_000)
  const formatter = new Intl.RelativeTimeFormat(localeFor(language), { numeric: 'always' })

  if (differenceSeconds < 60) {
    return language === 'vi' ? 'vừa xong' : 'just now'
  }

  const differenceMinutes = Math.floor(differenceSeconds / 60)
  if (differenceMinutes < 60) {
    return formatter.format(direction * differenceMinutes, 'minute')
  }

  const differenceHours = Math.floor(differenceMinutes / 60)
  if (differenceHours < 24) {
    return formatter.format(direction * differenceHours, 'hour')
  }

  const differenceDays = Math.floor(differenceHours / 24)
  if (differenceDays < 7) {
    return formatter.format(direction * differenceDays, 'day')
  }

  return formatDate(date, language)
}
