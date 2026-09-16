import { defineConfig } from 'drizzle-kit'

/**
 * drizzle-kit is only used to generate SQL migrations from the schema in
 * `server/db/schema.ts`. Migrations are applied automatically at server boot
 * (see `server/utils/db.ts`) so no manual step is needed when deploying.
 *
 * `dialect` is always postgresql: the embedded development database (PGlite)
 * is a real PostgreSQL build compiled to WASM, so it shares the exact same
 * dialect, DDL and migrations as a hosted PostgreSQL instance.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: false,
})
