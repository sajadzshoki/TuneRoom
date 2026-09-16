/**
 * GET /api/guests/me — resolve the signed identity cookie.
 *
 * Returns `{ guest: null }` (200) for anonymous visitors so the client can
 * distinguish "no identity yet" from a network failure.
 */
export default defineEventHandler(async (event) => {
  const guest = await currentGuest(event)
  return { guest: guest ? serializeGuest(guest) : null }
})
