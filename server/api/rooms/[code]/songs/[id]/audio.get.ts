/**
 * GET /api/rooms/:code/songs/:id/audio — stream a track.
 *
 * Supports HTTP range requests (seeking) and `?download=1` for saving the file.
 * Membership is required: the room library is not public.
 */
export default defineEventHandler(async (event) => {
  const { song } = await useSongContext(event)
  const storage = useObjectStorage()

  const stat = await storage.stat(song.audioKey)
  if (!stat || stat.size === 0) {
    throwApi(
      410,
      ErrorCode.STORAGE_ERROR,
      'The audio file for this song is missing from storage.',
    )
  }

  const wantsDownload = ['1', 'true'].includes(String(getQuery(event).download ?? ''))
  const extension = audioExtensionFor(song.audioMime, song.audioKey)
  const fileName = `${sanitizeFileName(`${song.artist} - ${song.title}`, 'tuneroom')}.${extension}`

  setHeader(event, 'accept-ranges', 'bytes')
  setHeader(event, 'content-type', song.audioMime)
  setHeader(event, 'cache-control', 'private, max-age=3600')
  if (wantsDownload) {
    setHeader(
      event,
      'content-disposition',
      `attachment; filename="${fileName.replaceAll('"', '')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    )
  }

  const range = resolveByteRange(getHeader(event, 'range'), stat!.size, event)

  if (range) {
    const chunk = await storage.readRange(song.audioKey, range.start, range.end)
    if (!chunk)
      songNotFound()

    setResponseStatus(event, 206)
    setHeader(event, 'content-range', `bytes ${chunk!.start}-${chunk!.end}/${chunk!.size}`)
    setHeader(event, 'content-length', chunk!.end - chunk!.start + 1)
    return sendStream(event, chunk!.stream)
  }

  const full = await storage.readRange(song.audioKey, 0, stat!.size - 1)
  if (!full)
    songNotFound()

  setResponseStatus(event, 200)
  setHeader(event, 'content-length', stat!.size)
  return sendStream(event, full!.stream)
})
