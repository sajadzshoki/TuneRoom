import type { SongDTO, SongQuery } from '#shared/types'

/** GET /api/rooms/:code/songs?q=&sort=&favorites= — the room library. */
export default defineEventHandler<Promise<{ songs: SongDTO[] }>>(async (event) => {
  const { room, guest } = await useRoomContext(event)
  const query = parseWith(songQuerySchema, getQuery(event)) as SongQuery
  return { songs: await listSongs(room, guest, query) }
})
