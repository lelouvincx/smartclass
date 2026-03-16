import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineWorkersConfig(async () => {
  const migrationsPath = path.join(__dirname, 'worker/db/migrations')
  const migrations = await readD1Migrations(migrationsPath)

  return {
    test: {
      globals: true,
      include: ['worker/**/*.integration.test.js'],
      setupFiles: ['./worker/test/apply-migrations.js'],
      poolOptions: {
        workers: {
          isolatedStorage: true,
          wrangler: { configPath: './wrangler.toml' },
          miniflare: {
            bindings: {
              JWT_SECRET: 'test-secret-key-for-integration-tests',
              JWT_EXPIRES_IN: '7d',
              TEST_MIGRATIONS: migrations,
            },
          },
        },
      },
    },
  }
})
