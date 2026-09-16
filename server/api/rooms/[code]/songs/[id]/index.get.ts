import type { SongDTO } from '#shared/types'

/** GET /api/rooms/:code/songs/:id — a single track with its uploader. */
export default defineEventHandler<Promise<{ song: SongDTO }>>(async (event) => {
  const { room, guest, song } = await useSongContext(event)
  return { song: await serializeSongWithUploader(song, room, guest?.id ?? null) }
})
