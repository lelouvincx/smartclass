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
