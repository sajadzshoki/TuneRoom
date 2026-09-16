import { MAX_IMAGE_BYTES } from '#server/utils/ingest'
import type { SongDTO } from '#shared/types'

/** POST /api/rooms/:code/songs/:id/cover — upload custom artwork. */
export default defineEventHandler<Promise<{ song: SongDTO }>>(async (event) => {
  rateLimit(event, 'song:cover', 30, 60 * 60 * 1000)

  const { room, guest, song } = await useSongContext(event)
  if (!canManageSong(song, guest!.id, room.ownerId))
    forbidden('Only the person who added this song or the room owner can change its artwork.')

  const declaredLength = Number(getHeader(event, 'content-length') ?? 0)
  if (declaredLength > MAX_IMAGE_BYTES + 64 * 1024)
    badRequest('Cover images must be 6 MB or smaller.')

  const parts = await readMultipartFormData(event)
  const cover = readImagePart(parts, 'cover')
  if (!cover)
    badRequest('Choose a JPEG, PNG, WebP or GIF image to use as the cover.')

  const updated = await replaceCover(song, room, cover)
  return { song: await serializeSongWithUploader(updated, room, guest!.id) }
})
