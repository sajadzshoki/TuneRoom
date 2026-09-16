import { eq } from 'drizzle-orm'
import { rooms } from '#server/db/schema'

/** PATCH /api/rooms/:code — owner-only room settings (name, description). */
export default defineEventHandler(async (event) => {
  rateLimit(event, 'room:update', 30, 60_000)

  const { room, guest } = await useRoomContext(event)
  if (room.ownerId !== guest!.id)
    forbidden('Only the room owner can change these settings.')

  const body = await readBody<{ name?: unknown, description?: unknown }>(event).catch(() => ({}))
  const input = parseWith(updateRoomSchema, body)

  const database = await db()
  const [updated] = await database
    .update(rooms)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      updatedAt: new Date(),
    })
    .where(eq(rooms.id, room.id))
    .returning()

  return { room: await buildRoomDTO(updated!, guest) }
})
