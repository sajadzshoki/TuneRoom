import { rooms } from '#server/db/schema'

/**
 * POST /api/rooms — create a room.
 *
 * The creator becomes the owner and is immediately a member, so they land in a
 * room they are already "in".
 */
export default defineEventHandler(async (event) => {
  rateLimit(event, 'room:create', 10, 60 * 60 * 1000)

  const guest = await requireGuest(event)
  const body = await readBody<{ name?: unknown, description?: unknown }>(event).catch(() => ({}))
  const input = parseWith(createRoomSchema, body)

  const database = await db()
  const id = newId()
  const slug = await uniqueSlug(input.name)
  const code = await uniqueRoomCode()

  const [room] = await database
    .insert(rooms)
    .values({
      id,
      name: input.name,
      description: input.description,
      slug,
      code,
      ownerId: guest.id,
    })
    .returning()

  await joinRoom(id, guest.id)

  return {
    room: serializeRoom(room!, {
      owner: guest,
      songCount: 0,
      onlineCount: 1,
      viewerId: guest.id,
      isMember: true,
    }),
    url: `/room/${slug}`,
  }
})
