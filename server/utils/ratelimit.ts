import type { H3Event } from 'h3'

/**
 * Minimal in-memory sliding window rate limiter.
 *
 * Enough to stop a single client from hammering expensive endpoints (uploads,
 * URL fetches, room creation). For multi-instance deployments swap the Map for
 * Redis — the call sites stay identical (see PROJECT.md).
 */
const buckets = new Map<string, number[]>()
const MAX_KEYS = 20_000

export function clientIp(event: H3Event): string {
  const forwarded = getHeader(event, 'x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first)
      return first
  }
  const real = getHeader(event, 'x-real-ip')
  if (real)
    return real.trim()
  return event.node.req.socket?.remoteAddress ?? 'unknown'
}

/** Throws a 429 when the caller exceeded `limit` requests in `windowMs`. */
export function rateLimit(event: H3Event, name: string, limit: number, windowMs: number): void {
  if (!serverConfig().rateLimitEnabled)
    return

  const key = `${name}:${clientIp(event)}`
  const now = Date.now()
  const hits = (buckets.get(key) ?? []).filter(time => now - time < windowMs)

  if (hits.length >= limit) {
    const retryAfter = Math.max(1, Math.ceil((windowMs - (now - (hits[0] ?? now))) / 1000))
    setHeader(event, 'retry-after', retryAfter)
    buckets.set(key, hits)
    rateLimited(retryAfter)
  }

  hits.push(now)
  buckets.set(key, hits)

  if (buckets.size > MAX_KEYS)
    prune(now)
}

function prune(now: number): void {
  for (const [key, hits] of buckets) {
    const fresh = hits.filter(time => now - time < 60_000)
    if (fresh.length === 0)
      buckets.delete(key)
    else
      buckets.set(key, fresh)
  }
}
