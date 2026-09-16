import type { SongDTO } from '#shared/types'

/** PATCH /api/rooms/:code/songs/:id — fix title/artist/album. Uploader or owner. */
export default defineEventHandler<Promise<{ song: SongDTO }>>(async (event) => {
  rateLimit(event, 'song:update', 60, 60_000)

  const { room, guest, song } = await useSongContext(event)
  if (!canManageSong(song, guest!.id, room.ownerId))
    forbidden('Only the person who added this song or the room owner can edit it.')

  const body = await readBody<{ title?: unknown, artist?: unknown, album?: unknown }>(event).catch(() => ({}))
  const input = parseWith(updateSongSchema, body)

  const updated = await updateSongDetails(song, {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.artist !== undefined ? { artist: input.artist ?? 'Unknown artist' } : {}),
    ...(input.album !== undefined ? { album: input.album } : {}),
  })

  return { song: await serializeSongWithUploader(updated, room, guest!.id) }
})
