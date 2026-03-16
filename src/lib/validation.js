export const PHONE_REGEX = /^\+84\d{9,10}$/

/**
 * Normalises a Vietnamese phone number to the +84 international format.
 * Accepts either the +84 prefix or the local 0 prefix.
 */
export function normalizePhone(phone) {
  if (typeof phone !== 'string') return phone
  const trimmed = phone.trim()
  if (trimmed.startsWith('0')) {
    return '+84' + trimmed.slice(1)
  }
  return trimmed
}
