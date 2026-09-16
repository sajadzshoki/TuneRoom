import type { UploadResultDTO } from '#shared/types'

/**
 * POST /api/rooms/:code/songs — add a track from a direct audio URL.
 *
 * Only plain public http(s) links are accepted, the destination is validated
 * against private address space before and after every redirect, and the file
 * is stored server side like any other track.
 */
export default defineEventHandler<Promise<UploadResultDTO>>(async (event) => {
  rateLimit(event, 'song:url', 20, 60 * 60 * 1000)

  const { room, guest } = await useRoomContext(event)
  const body = await readBody<{ url?: unknown, title?: unknown, artist?: unknown, album?: unknown }>(event)
    .catch(() => ({}))
  const input = parseWith(addUrlSongSchema, body)

  const target = await assertSafeRemoteUrl(input.url)
  const remote = await fetchRemoteAudio(target, serverConfig().maxUrlFetchBytes)

  if (remote.buffer.byteLength === 0)
    invalidAudio('That link returned an empty file.')

  const pathName = decodeURIComponent(remote.finalUrl.pathname.split('/').filter(Boolean).pop() ?? '')

  return ingestAudio({
    room,
    guest: guest!,
    data: remote.buffer,
    fileName: pathName || null,
    declaredMime: remote.contentType || null,
    source: 'url',
    sourceUrl: input.url,
    overrides: {
      ...(input.title ? { title: input.title } : {}),
      ...(input.artist ? { artist: input.artist } : {}),
      ...(input.album ? { album: input.album } : {}),
    },
  })
})
