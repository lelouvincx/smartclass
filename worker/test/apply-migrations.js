import { env } from 'cloudflare:test'
import { applyD1Migrations } from 'cloudflare:test'

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
