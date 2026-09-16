import { guests } from '#server/db/schema'

/**
 * POST /api/guests — create an anonymous identity.
 *
 * Name + avatar only. The server mints the id and signs it into an httpOnly
 * cookie; from here on the identity is never taken from a request body.
 */
export default defineEventHandler(async (event) => {
  rateLimit(event, 'guest:create', 20, 60_000)

  const body = await readBody<{ name?: unknown, avatar?: unknown }>(event).catch(() => ({}))
  const input = parseWith(createGuestSchema, body)

  const database = await db()
  const id = newId()
  const [guest] = await database
    .insert(guests)
    .values({ id, name: input.name, avatar: input.avatar })
    .returning()

  issueIdentityCookie(event, id)

  return { guest: serializeGuest(guest!) }
})
