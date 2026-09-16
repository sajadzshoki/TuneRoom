import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Single place where every environment variable is read, validated and
 * normalised. Nothing else in the server touches `process.env`.
 */
export interface ServerConfig {
  sessionSecret: string
  /** When set, a real PostgreSQL server is used through node-postgres. */
  databaseUrl: string | null
  /** Data directory for the embedded PostgreSQL fallback. */
  pgDataDir: string
  storageDriver: string
  storageDir: string
  maxUploadBytes: number
  maxUrlFetchBytes: number
  rateLimitEnabled: boolean
  appUrl: string
  migrationsFolder: string | null
}

const MB = 1024 * 1024

function toNumber(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '')
    return fallback
  return !['false', '0', 'no', 'off'].includes(String(value).toLowerCase())
}

/** Resolves a (possibly relative) data directory against the process root. */
export function resolveDataPath(dir: string): string {
  return resolve(process.cwd(), dir)
}

export function serverConfig(): ServerConfig {
  const rc = useRuntimeConfig()
  const env = process.env

  const appUrl = String(env.NUXT_PUBLIC_APP_URL || rc.public?.appUrl || '').replace(/\/+$/, '')

  return {
    sessionSecret: String(env.NUXT_SESSION_SECRET || rc.sessionSecret || ''),
    databaseUrl: String(env.DATABASE_URL || rc.databaseUrl || '').trim() || null,
    pgDataDir: resolveDataPath(String(env.PGDATA_DIR || rc.pgDataDir || '.data/pg')),
    storageDriver: String(env.STORAGE_DRIVER || rc.storageDriver || 'local').toLowerCase(),
    storageDir: resolveDataPath(String(env.STORAGE_DIR || rc.storageDir || '.data/storage')),
    maxUploadBytes: toNumber(env.MAX_UPLOAD_MB ?? rc.public?.maxUploadMb, 60) * MB,
    maxUrlFetchBytes: toNumber(env.MAX_URL_FETCH_MB ?? rc.maxUrlFetchMb, 60) * MB,
    rateLimitEnabled: toBoolean(env.RATE_LIMIT_ENABLED ?? rc.rateLimitEnabled, true),
    appUrl,
    migrationsFolder: resolveMigrationsFolder(env.DRIZZLE_MIGRATIONS_FOLDER),
  }
}

/**
 * Locates the drizzle migration folder in dev (`./drizzle`) and in a production
 * bundle (`.output/server/drizzle`, copied by `scripts/postbuild.mjs`).
 */
function resolveMigrationsFolder(explicit?: string): string | null {
  const here = typeof import.meta.dirname === 'string' ? import.meta.dirname : process.cwd()
  const candidates = [
    explicit,
    resolve(process.cwd(), 'drizzle'),
    resolve(here, 'drizzle'),
    resolve(here, '..', 'drizzle'),
    resolve(here, '..', '..', 'drizzle'),
  ].filter((p): p is string => Boolean(p))

  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, 'meta', '_journal.json')))
      return candidate
  }
  return null
}
