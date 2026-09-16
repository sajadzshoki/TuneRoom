/**
 * Copies the drizzle migration folder into the Nitro output so a production
 * server can migrate itself on boot.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'drizzle')
const target = resolve(root, '.output/server/drizzle')

if (!existsSync(source)) {
  console.warn('[postbuild] No ./drizzle folder found — skipping migration copy.')
  process.exit(0)
}

mkdirSync(dirname(target), { recursive: true })
cpSync(source, target, { recursive: true })
console.log(`[postbuild] Copied migrations to ${target}`)
