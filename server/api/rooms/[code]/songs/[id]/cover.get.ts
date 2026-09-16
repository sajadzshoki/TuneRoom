/** GET /api/rooms/:code/songs/:id/cover — song artwork from object storage. */
export default defineEventHandler(async (event) => {
  const { song } = await useSongContext(event)

  if (!song.coverKey)
    throwApi(404, ErrorCode.SONG_NOT_FOUND, 'This song has no artwork.')

  const storage = useObjectStorage()
  const data = await storage.read(song.coverKey)
  if (!data)
    throwApi(404, ErrorCode.SONG_NOT_FOUND, 'The artwork for this song is missing from storage.')

  setHeader(event, 'content-type', imageMimeFor(song.coverKey))
  setHeader(event, 'content-length', data!.byteLength)
  // The URL carries ?v=<updatedAt>, so this is safe to cache aggressively.
  setHeader(event, 'cache-control', 'private, max-age=31536000, immutable')
  return Buffer.from(data!)
})
