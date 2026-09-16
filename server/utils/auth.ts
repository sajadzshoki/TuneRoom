import { createHmac, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { guests } from '../db/schema'
import type { GuestRow } from '../db/schema'

/**
 * Guest identity.
 *
 * TuneRoom has no accounts, but identity is still never taken from a request
 * body: the server issues an HMAC-signed token in an httpOnly cookie and every
 * write is attributed to the guest that token resolves to. A client cannot
 * claim to be somebody else.
 *
 * This is the single seam where a real authentication system (magic links,
 * OAuth, sessions) would later be plugged in — handlers only ever depend on
 * `currentGuest()` / `requireGuest()` returning a `GuestRow`.
 */
export const IDENTITY_COOKIE = 'tr_identity'

const TOKEN_VERSION = 'v1'
const TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000
const DEFAULT_DEV_SECRET = 'dev-only-insecure-secret'

let warnedAboutSecret = false

function signingSecret(): string {
  const secret = serverConfig().sessionSecret
  if (!secret) {
    throw new Error(
      '[tuneroom] NUXT_SESSION_SECRET is not set. Generate one with `openssl rand -hex 32`.',
    )
  }
  if (secret === DEFAULT_DEV_SECRET && process.env.NODE_ENV === 'production' && !warnedAboutSecret) {
    warnedAboutSecret = true
    console.warn('[tuneroom] WARNING: using the default development secret in production.')
  }
  return secret
}

function sign(payload: string): string {
  return createHmac('sha256', signingSecret()).update(payload).digest('base64url')
}

export function signIdentityToken(guestId: string): string {
  const expires = Date.now() + TOKEN_TTL_MS
  const payload = `${TOKEN_VERSION}.${guestId}.${expires}`
  return `${payload}.${sign(payload)}`
}

export function verifyIdentityToken(token: string | null | undefined): string | null {
  if (!token)
    return null

  const parts = token.split('.')
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION)
    return null

  const [version, guestId, rawExpires, signature] = parts as [string, string, string, string]
  const payload = `${version}.${guestId}.${rawExpires}`

  const expected = Buffer.from(sign(payload))
  const received = Buffer.from(signature)
  if (expected.length !== received.length || !timingSafeEqual(expected, received))
    return null

  const expires = Number(rawExpires)
  if (!Number.isFinite(expires) || expires < Date.now())
    return null

  return guestId
}

export function issueIdentityCookie(event: H3Event, guestId: string): void {
  setCookie(event, IDENTITY_COOKIE, signIdentityToken(guestId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(TOKEN_TTL_MS / 1000),
  })
}

export function clearIdentityCookie(event: H3Event): void {
  deleteCookie(event, IDENTITY_COOKIE, { path: '/' })
}

/** Resolves the signed cookie into a guest row. Returns null when anonymous. */
export async function currentGuest(event: H3Event): Promise<GuestRow | null> {
  const guestId = verifyIdentityToken(getCookie(event, IDENTITY_COOKIE))
  if (!guestId)
    return null

  const database = await db()
  const rows = await database
    .select()
    .from(guests)
    .where(eq(guests.id, guestId))
    .limit(1)

  const guest = rows[0]
  if (!guest) {
    // Cookie outlived the row it pointed at — drop it.
    clearIdentityCookie(event)
    return null
  }
  return guest
}

/** Same as `currentGuest` but rejects anonymous callers with a 401. */
export async function requireGuest(event: H3Event): Promise<GuestRow> {
  const guest = await currentGuest(event)
  if (!guest)
    unauthenticated()
  return guest
}
