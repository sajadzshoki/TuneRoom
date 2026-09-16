import { existsSync, mkdirSync } from 'node:fs'
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import pg from 'pg'
import * as schema from '../db/schema'

/**
 * Database access.
 *
 * One Drizzle schema (`server/db/schema.ts`) with two interchangeable drivers:
 *
 *  - `DATABASE_URL` set   -> node-postgres against a real PostgreSQL server.
 *  - `DATABASE_URL` empty -> PGlite: PostgreSQL compiled to WASM, persisted to
 *    `PGDATA_DIR`. Local development therefore needs no database server while
 *    still using the exact same SQL dialect, DDL and migrations as production.
 *
 * Both drivers expose the identical Drizzle query API, so the rest of the
 * server is written once against `Db`.
 *
 * Migrations from `./drizzle` are applied automatically on first use, so a
 * fresh checkout — or a fresh production database — needs no manual step.
 */
export type Db = NodePgDatabase<typeof schema>

/**
 * Cached on `globalThis` so Vite/Nitro hot reloads in development reuse the same
 * connection instead of opening a second one on the same data directory.
 */
interface DbCache {
  instance?: Db
  migrate?: Promise<void>
  usingPglite?: boolean
}

const cache: DbCache = ((globalThis as { __tuneroomDb?: DbCache }).__tuneroomDb ??= {})

/** Lazily creates the database client. */
export function useDb(): Db {
  if (cache.instance)
    return cache.instance

  const config = serverConfig()

  if (config.databaseUrl) {
    cache.usingPglite = false
    const pool = new pg.Pool({
      connectionString: config.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    })
    pool.on('error', error => console.error('[tuneroom] postgres pool error', error))
    cache.instance = drizzlePg({ client: pool, schema })
    console.info('[tuneroom] database: PostgreSQL (node-postgres)')
  }
  else {
    cache.usingPglite = true
    if (!existsSync(config.pgDataDir))
      mkdirSync(config.pgDataDir, { recursive: true })

    // PGlite is a real PostgreSQL build, so the cast only papers over the
    // driver-specific session type and keeps one canonical `Db` for the server.
    cache.instance = drizzlePglite(config.pgDataDir, { schema }) as unknown as Db
    console.info(`[tuneroom] database: embedded PostgreSQL (PGlite) at ${config.pgDataDir}`)
  }

  return cache.instance
}

/**
 * Applies pending migrations exactly once per process. Handlers await this
 * before touching the database so a cold start can never race the schema.
 */
export function ensureMigrated(): Promise<void> {
  if (!cache.migrate) {
    cache.migrate = runMigrations().catch((error) => {
      cache.migrate = undefined
      throw error
    })
  }
  return cache.migrate
}

async function runMigrations(): Promise<void> {
  const db = useDb()
  const folder = serverConfig().migrationsFolder

  if (!folder) {
    throw new Error(
      '[tuneroom] Could not locate the drizzle migrations folder. Run '
      + '`npm run db:generate` in development, or deploy the drizzle/ directory '
      + 'next to .output/server (or set DRIZZLE_MIGRATIONS_FOLDER).',
    )
  }

  try {
    if (cache.usingPglite) {
      await migratePglite(db as never, { migrationsFolder: folder })
    }
    else {
      await migratePg(db, { migrationsFolder: folder })
    }
    console.info(`[tuneroom] migrations applied from ${folder}`)
  }
  catch (error) {
    console.error('[tuneroom] migration failed', error)
    throw error
  }
}

/** Convenience: awaits migrations then returns the database client. */
export async function db(): Promise<Db> {
  await ensureMigrated()
  return useDb()
}
