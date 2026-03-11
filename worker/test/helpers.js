import { sign } from 'hono/jwt'

/**
 * Create a test JWT token for authentication testing
 * @param {Object} user - User object with id, role, phone
 * @param {string} secret - JWT secret (defaults to test secret)
 * @returns {Promise<string>} JWT token
 */
export async function createTestToken(user, secret = 'test-secret-key-for-vitest-running-worker-tests-securely') {
  const now = Math.floor(Date.now() / 1000)
  return sign({
    sub: String(user.id),
    role: user.role,
    phone: user.phone,
    iat: now,
    exp: now + 604800, // 7 days
  }, secret, 'HS256')
}

/**
 * Create a mock environment object for worker context
 * @param {Object} overrides - Override default values
 * @returns {Object} Mock environment
 */
export function createMockEnv(overrides = {}) {
  return {
    JWT_SECRET: 'test-secret-key-for-vitest-running-worker-tests-securely',
    JWT_EXPIRES_IN: '7d',
    APP_ENV: 'test',
    APP_CORS_ORIGIN: 'http://localhost:5173',
    ...overrides,
  }
}
