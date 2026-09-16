import { MAX_IMAGE_BYTES } from '#server/utils/ingest'
import type { UploadResultDTO } from '#shared/types'

/**
 * POST /api/rooms/:code/songs/upload — multipart audio upload.
 *
 * Parts:
 *   file  (required) the audio file
 *   cover (optional) custom artwork, JPEG/PNG/WebP/GIF
 *   meta  (optional) JSON with title/artist/album overrides
 */
export default defineEventHandler<Promise<UploadResultDTO>>(async (event) => {
  rateLimit(event, 'song:upload', 40, 60 * 60 * 1000)

  const { room, guest } = await useRoomContext(event)
  const config = serverConfig()

  // Reject oversized bodies before buffering them.
  const declaredLength = Number(getHeader(event, 'content-length') ?? 0)
  if (declaredLength > config.maxUploadBytes + MAX_IMAGE_BYTES + 64 * 1024)
    fileTooLarge(config.maxUploadBytes)

  const parts = await readMultipartFormData(event)
  const audioPart = parts?.find(part => part.name === 'file' && part.filename)
  if (!audioPart)
    badRequest('Choose an audio file to upload.')
  if (audioPart.data.byteLength === 0)
    badRequest('That file is empty.')
  if (audioPart.data.byteLength > config.maxUploadBytes)
    fileTooLarge(config.maxUploadBytes)

  const metaPart = parts?.find(part => part.name === 'meta')
  const overrides = metaPart
    ? songOverridesSchema.safeParse(parseJsonSafe(metaPart.data.toString('utf8'))).data ?? {}
    : {}

  return ingestAudio({
    room,
    guest: guest!,
    data: audioPart.data,
    fileName: audioPart.filename ?? null,
    declaredMime: audioPart.type ?? null,
    source: 'upload',
    overrides,
    cover: readImagePart(parts, 'cover'),
  })
})
