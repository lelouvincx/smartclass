/**
 * Return a success JSON response
 * @param {Object} c - Hono context
 * @param {*} data - Response data
 * @param {number} status - HTTP status code (default: 200)
 * @returns {Response} JSON response
 */
export function jsonSuccess(c, data, status = 200) {
  return c.json({ success: true, data }, status)
}

/**
 * Return an error JSON response
 * @param {Object} c - Hono context
 * @param {number} status - HTTP status code
 * @param {string} code - Error code (e.g., 'VALIDATION_ERROR')
 * @param {string} message - Error message
 * @returns {Response} JSON response
 */
export function jsonError(c, status, code, message) {
  return c.json(
    {
      success: false,
      error: {
        code,
        message,
      },
    },
    status,
  )
}
