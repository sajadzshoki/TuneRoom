import { createReadStream, promises as fsp } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import type { Readable } from 'node:stream'

/**
 * Object storage abstraction.
 *
 * Audio bytes never live in the database — songs only reference a storage key.
 * The MVP ships one driver (local disk); the interface is deliberately small so
 * an S3-compatible driver can be dropped in without touching a single handler
 * (see PROJECT.md → "Storage").
 *
 * Range reads are part of the contract because audio playback seeks, and both
 * POSIX filesystems and S3 support byte ranges natively.
 */
export interface StorageRange {
  stream: Readable
  /** Total size of the object in bytes. */
  size: number
  /** Inclusive first byte returned. */
  start: number
  /** Inclusive last byte returned. */
  end: number
}

export interface StorageDriver {
  readonly id: string
  put(key: string, data: Uint8Array): Promise<void>
  read(key: string): Promise<Uint8Array | null>
  readRange(key: string, start: number, end?: number): Promise<StorageRange | null>
  stat(key: string): Promise<{ size: number } | null>
  remove(key: string): Promise<void>
}

/**
 * Keys are generated server side from ids and known extensions, so the alphabet
 * is deliberately narrow. Anything outside it — including `..` — is refused,
 * which is what makes path traversal impossible.
 */
const KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,253}[a-zA-Z0-9]$/

/** Rejects anything that could escape the storage root. */
export function assertSafeStorageKey(key: string): string {
  if (typeof key !== 'string' || !KEY_PATTERN.test(key) || key.includes('..'))
    throwApi(500, ErrorCode.STORAGE_ERROR, 'Refusing to touch an unsafe storage key.')
  return key
}

class LocalStorageDriver implements StorageDriver {
  readonly id = 'local'

  constructor(private readonly root: string) {}

  private path(key: string): string {
    assertSafeStorageKey(key)
    const full = resolve(this.root, key)
    const rel = relative(this.root, full)
    if (!rel || rel.startsWith('..') || isAbsolute(rel))
      throwApi(500, ErrorCode.STORAGE_ERROR, 'Storage key escapes the storage root.')
    return full
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const target = this.path(key)
    await fsp.mkdir(resolve(target, '..'), { recursive: true })
    await fsp.writeFile(target, data)
  }

  async read(key: string): Promise<Uint8Array | null> {
    try {
      return await fsp.readFile(this.path(key))
    }
    catch (error) {
      if (isNotFound(error))
        return null
      throw error
    }
  }

  async readRange(key: string, start: number, end?: number): Promise<StorageRange | null> {
    const target = this.path(key)
    let size: number
    try {
      size = (await fsp.stat(target)).size
    }
    catch (error) {
      if (isNotFound(error))
        return null
      throw error
    }

    const from = Math.max(0, Math.min(start, size - 1 || 0))
    const to = Math.max(from, Math.min(end ?? size - 1, size - 1))
    return { stream: createReadStream(target, { start: from, end: to }), size, start: from, end: to }
  }

  async stat(key: string): Promise<{ size: number } | null> {
    try {
      return { size: (await fsp.stat(this.path(key))).size }
    }
    catch (error) {
      if (isNotFound(error))
        return null
      throw error
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await fsp.unlink(this.path(key))
    }
    catch (error) {
      if (!isNotFound(error))
        throw error
    }
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT'
}

const drivers = new Map<string, StorageDriver>()

/** Returns the configured storage driver, creating it once per process. */
export function useObjectStorage(): StorageDriver {
  const config = serverConfig()
  const id = config.storageDriver

  const existing = drivers.get(id)
  if (existing)
    return existing

  let driver: StorageDriver
  switch (id) {
    case 'local':
      driver = new LocalStorageDriver(config.storageDir)
      break
    default:
      throw new Error(
        `[tuneroom] Unknown STORAGE_DRIVER "${id}". Available drivers: local. `
        + 'Register additional drivers (S3, GCS, …) in server/utils/storage.ts.',
      )
  }

  drivers.set(id, driver)
  return driver
}
