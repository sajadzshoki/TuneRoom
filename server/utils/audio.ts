import { parseBuffer } from 'music-metadata'

/**
 * Audio format detection and metadata extraction.
 *
 * Everything a song card needs (title, artist, album, duration, cover art) is
 * read from the file itself, so people never have to type metadata by hand —
 * and when a file genuinely has no tags we say so and offer a form.
 */

export interface AudioFormat {
  mime: string
  ext: string
}

export interface ParsedAudio {
  title: string | null
  artist: string | null
  album: string | null
  /** Whole seconds; 0 when the container does not report a duration. */
  duration: number
  picture: { data: Buffer; mime: string } | null
  /** True when no title/artist tags were present at all. */
  needsMetadata: boolean
}

const MAX_COVER_BYTES = 6 * 1024 * 1024

/** Extensions we accept, mapped to the canonical mime type we store. */
const EXTENSION_FORMATS: Record<string, AudioFormat> = {
  mp3: { mime: 'audio/mpeg', ext: 'mp3' },
  m4a: { mime: 'audio/mp4', ext: 'm4a' },
  aac: { mime: 'audio/aac', ext: 'aac' },
  wav: { mime: 'audio/wav', ext: 'wav' },
  wave: { mime: 'audio/wav', ext: 'wav' },
  ogg: { mime: 'audio/ogg', ext: 'ogg' },
  oga: { mime: 'audio/ogg', ext: 'oga' },
  opus: { mime: 'audio/ogg', ext: 'opus' },
  flac: { mime: 'audio/flac', ext: 'flac' },
  weba: { mime: 'audio/webm', ext: 'weba' },
}

const MIME_FORMATS: Record<string, AudioFormat> = {
  'audio/mpeg': EXTENSION_FORMATS.mp3!,
  'audio/mp3': EXTENSION_FORMATS.mp3!,
  'audio/mp4': EXTENSION_FORMATS.m4a!,
  'audio/x-m4a': EXTENSION_FORMATS.m4a!,
  'audio/aac': EXTENSION_FORMATS.aac!,
  'audio/wav': EXTENSION_FORMATS.wav!,
  'audio/x-wav': EXTENSION_FORMATS.wav!,
  'audio/wave': EXTENSION_FORMATS.wav!,
  'audio/ogg': EXTENSION_FORMATS.ogg!,
  'application/ogg': EXTENSION_FORMATS.ogg!,
  'audio/opus': EXTENSION_FORMATS.opus!,
  'audio/flac': EXTENSION_FORMATS.flac!,
  'audio/x-flac': EXTENSION_FORMATS.flac!,
  'audio/webm': EXTENSION_FORMATS.weba!,
}

/** Accepted formats live in `shared/audio.ts` so the upload UI matches. */
export { AUDIO_ACCEPT } from '#shared/audio'

export function extensionOf(fileName: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim())
  return match?.[1]?.toLowerCase() ?? ''
}

/**
 * Resolves the container from the file name and/or the declared mime type.
 * The extension wins when both are present because browsers report generic
 * mimes (`audio/x-m4a`, `application/octet-stream`) surprisingly often.
 */
export function detectAudioFormat(fileName?: string | null, declaredMime?: string | null): AudioFormat | null {
  const ext = fileName ? extensionOf(fileName) : ''
  if (ext && EXTENSION_FORMATS[ext])
    return EXTENSION_FORMATS[ext]!

  const mime = (declaredMime ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  if (mime && MIME_FORMATS[mime])
    return MIME_FORMATS[mime]!

  return null
}

export function normalizeImageMime(value: string | undefined | null): string | null {
  const raw = (value ?? '').toLowerCase().trim()
  if (raw.startsWith('image/')) {
    return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(raw) ? raw : null
  }
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
  }
  return map[raw] ?? null
}

export function extensionForImageMime(mime: string): string {
  switch (mime) {
    case 'image/png': return 'png'
    case 'image/webp': return 'webp'
    case 'image/gif': return 'gif'
    default: return 'jpg'
  }
}

/** `03 - Something Loud.mp3` -> `Something Loud` */
export function titleFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[a-z0-9]+$/i, '')
  const cleaned = withoutExtension
    .replace(/^\d{1,3}[\s._-]+/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return cleaned || 'Unknown title'
}

/** Reads tags, duration and embedded artwork out of an audio buffer. */
export async function parseAudioMetadata(
  buffer: Uint8Array,
  format: AudioFormat,
  fileName?: string | null,
): Promise<ParsedAudio> {
  let meta
  try {
    meta = await parseBuffer(
      buffer,
      { mimeType: format.mime, path: fileName ?? `audio.${format.ext}`, size: buffer.byteLength },
      { duration: true },
    )
  }
  catch (error) {
    console.warn('[tuneroom] audio metadata parse failed', fileName, (error as Error)?.message)
    invalidAudio('We could not read that file as audio. Try another file or format.')
  }

  // A file with no container, codec, duration, sample rate or bitrate is not
  // audio at all — music-metadata tolerates junk bytes, so we do not.
  const detected = meta!.format
  const looksLikeAudio = Boolean(
    detected.container || detected.codec || detected.duration || detected.sampleRate || detected.bitrate,
  )
  if (!looksLikeAudio)
    invalidAudio('That file does not contain readable audio. Try another file or format.')

  const common = meta!.common
  const title = cleanText(common.title) ?? (fileName ? titleFromFileName(fileName) : null)
  const artist = cleanText(common.artist)
    ?? cleanText(common.artists?.join(', '))
    ?? cleanText(common.albumartist)
  const album = cleanText(common.album)

  const rawDuration = detected.duration
  const duration = Number.isFinite(rawDuration) ? Math.max(0, Math.round(rawDuration as number)) : 0

  return {
    title,
    artist,
    album,
    duration,
    picture: extractPicture(meta!.common.picture),
    needsMetadata: !cleanText(common.title) && !artist,
  }
}

function extractPicture(
  pictures: readonly { format: string; data: Uint8Array }[] | undefined,
): { data: Buffer; mime: string } | null {
  for (const picture of pictures ?? []) {
    const mime = normalizeImageMime(picture.format)
    if (!mime || !picture.data || picture.data.byteLength === 0)
      continue
    if (picture.data.byteLength > MAX_COVER_BYTES)
      continue
    return { data: Buffer.from(picture.data), mime }
  }
  return null
}

function cleanText(value: string | undefined | null): string | null {
  if (typeof value !== 'string')
    return null
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed.length > 0 ? trimmed.slice(0, 200) : null
}
