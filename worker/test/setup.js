import { beforeAll, vi } from 'vitest'

// Mock environment for worker tests
beforeAll(() => {
  // Set up global test environment if needed
})

// Export test environment creator
export function createMockEnv(overrides = {}) {
  return {
    JWT_SECRET: 'test-secret-key-for-vitest-running-worker-tests-securely',
    JWT_EXPIRES_IN: '7d',
    APP_ENV: 'test',
    APP_CORS_ORIGIN: 'http://localhost:5173',
    ...overrides,
  }
}
