import type { GuestRow, RoomRow, SongRow } from '#server/db/schema'
import type { SongDTO, SongSource } from '#shared/types'

/**
 * Audio ingestion.
 *
 * One code path turns bytes into a stored song, shared by the upload and the
 * "add from URL" endpoints: detect the container, read the tags, write the
 * audio (and artwork) to object storage, insert the row, and clean up if
 * anything fails halfway through.
 */

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024
/** Files below this size are never real audio. */
const MIN_AUDIO_BYTES = 1024

export interface CoverInput {
  data: Buffer
  mime: string
}

export interface IngestInput {
  room: RoomRow
  guest: GuestRow
  data: Buffer
  fileName: string | null
  declaredMime: string | null
  source: SongSource
  sourceUrl?: string | null
  overrides?: { title?: string, artist?: string, album?: string }
  cover?: CoverInput | null
}

export interface IngestResult {
  song: SongDTO
  /** True when the file carried no title/artist tags at all. */
  needsMetadata: boolean
}

export async function ingestAudio(input: IngestInput): Promise<IngestResult> {
  const { room, guest, data } = input
  const storage = useObjectStorage()

  const format = detectAudioFormat(input.fileName, input.declaredMime)
  if (!format) {
    unsupportedFile(
      `Unsupported file. Add MP3, WAV, M4A, OGG, AAC, FLAC or Opus audio${input.fileName ? ` (received "${input.fileName}")` : ''}.`,
    )
  }

  if (data.byteLength < MIN_AUDIO_BYTES)
    invalidAudio('That file is far too small to be audio.')

  const parsed = await parseAudioMetadata(data, format!, input.fileName)

  const overrides = input.overrides ?? {}
  const title = overrides.title?.trim() || parsed.title || titleFromFileName(input.fileName ?? `audio.${format!.ext}`)
  const artist = overrides.artist?.trim() || parsed.artist || 'Unknown artist'
  const album = overrides.album?.trim() || parsed.album || null
  const cover = input.cover ?? parsed.picture

  const songId = newId()
  const audioKey = `rooms/${room.id}/audio/${songId}.${format!.ext}`
  let coverKey: string | null = null

  try {
    await storage.put(audioKey, data)

    if (cover && cover.data.byteLength > 0) {
      coverKey = `rooms/${room.id}/covers/${songId}.${extensionForImageMime(cover.mime)}`
      await storage.put(coverKey, cover.data)
    }

    const song = await insertSong({
      room,
      uploader: guest,
      title,
      artist,
      album,
      duration: parsed.duration,
      audioKey,
      audioMime: format!.mime,
      audioSize: data.byteLength,
      coverKey,
      source: input.source,
      sourceUrl: input.sourceUrl ?? null,
    })

    return {
      song: serializeNewSong(song, room, guest),
      needsMetadata: parsed.needsMetadata && !overrides.title,
    }
  }
  catch (error) {
    // Never leave orphaned objects behind when the row could not be written.
    await storage.remove(audioKey).catch(() => {})
    if (coverKey)
      await storage.remove(coverKey).catch(() => {})
    throw error
  }
}

/** Replaces a song's artwork. Returns the updated DTO. */
export async function replaceCover(song: SongRow, room: RoomRow, cover: CoverInput): Promise<SongRow> {
  const storage = useObjectStorage()
  const previousKey = song.coverKey
  const nextKey = `rooms/${room.id}/covers/${song.id}.${extensionForImageMime(cover.mime)}`

  await storage.put(nextKey, cover.data)
  const updated = await updateSongDetails(song, { coverKey: nextKey })

  if (previousKey && previousKey !== nextKey)
    await storage.remove(previousKey).catch(() => {})

  return updated
}

/** Validates an uploaded image part and returns its bytes and mime type. */
export function readImagePart(
  parts: { name?: string, filename?: string, type?: string, data: Buffer }[] | null | undefined,
  name: string,
): CoverInput | null {
  const part = parts?.find(candidate => candidate.name === name && candidate.filename)
  if (!part)
    return null

  if (part.data.byteLength === 0)
    badRequest('That cover image is empty.')
  if (part.data.byteLength > MAX_IMAGE_BYTES)
    badRequest('Cover images must be 6 MB or smaller.')

  const mime = normalizeImageMime(part.type ?? extensionOf(part.filename ?? ''))
  if (!mime)
    badRequest('Cover images must be JPEG, PNG, WebP or GIF.')

  return { data: part.data, mime }
}

/** The uploader of a freshly ingested song is always the caller. */
export function serializeNewSong(song: SongRow, room: RoomRow, uploader: GuestRow): SongDTO {
  return serializeSong(song, {
    roomCode: room.code,
    roomOwnerId: room.ownerId,
    viewerId: uploader.id,
    uploader: { id: uploader.id, name: uploader.name, avatar: uploader.avatar },
    favorited: false,
  })
}

/** Builds a song DTO with a fully loaded uploader. */
export async function serializeSongWithUploader(
  song: SongRow,
  room: RoomRow,
  viewerId: string | null,
): Promise<SongDTO> {
  const uploader = await findGuest(song.uploaderId)
  const favorited = await isFavorite(song.id, viewerId)

  return serializeSong(song, {
    roomCode: room.code,
    roomOwnerId: room.ownerId,
    viewerId,
    uploader: uploader ?? { id: song.uploaderId, name: 'Someone who left', avatar: 'slate' },
    favorited,
  })
}
