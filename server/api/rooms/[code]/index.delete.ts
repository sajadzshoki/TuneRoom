import { eq } from 'drizzle-orm'
import { rooms, songs } from '#server/db/schema'

/**
 * DELETE /api/rooms/:code — owner-only.
 *
 * Storage objects are removed first (best effort), then the room row; every
 * child row cascades away with it.
 */
export default defineEventHandler(async (event) => {
  rateLimit(event, 'room:delete', 5, 60 * 60 * 1000)

  const { room, guest } = await useRoomContext(event)
  if (room.ownerId !== guest!.id)
    forbidden('Only the room owner can delete this room.')

  const database = await db()
  const storage = useObjectStorage()

  const roomSongs = await database
    .select({ audioKey: songs.audioKey, coverKey: songs.coverKey })
    .from(songs)
    .where(eq(songs.roomId, room.id))

  await database.delete(rooms).where(eq(rooms.id, room.id))

  for (const song of roomSongs) {
    await storage.remove(song.audioKey).catch(error =>
      console.error('[tuneroom] could not delete audio object', song.audioKey, error))
    if (song.coverKey) {
      await storage.remove(song.coverKey).catch(error =>
        console.error('[tuneroom] could not delete cover object', song.coverKey, error))
    }
  }

  return { deleted: true, roomId: room.id }
})
