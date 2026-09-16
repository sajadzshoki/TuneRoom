import { eq } from 'drizzle-orm'
import { guests } from '#server/db/schema'

/** PATCH /api/guests/me — change name and/or avatar. */
export default defineEventHandler(async (event) => {
  rateLimit(event, 'guest:update', 30, 60_000)

  const guest = await requireGuest(event)
  const body = await readBody<{ name?: unknown, avatar?: unknown }>(event).catch(() => ({}))
  const input = parseWith(updateGuestSchema, body)

  const database = await db()
  const [updated] = await database
    .update(guests)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.avatar !== undefined ? { avatar: input.avatar } : {}),
    })
    .where(eq(guests.id, guest.id))
    .returning()

  return { guest: serializeGuest(updated!) }
})
