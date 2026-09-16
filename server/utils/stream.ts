import type { H3Event } from 'h3'

/**
 * HTTP range support — the piece that makes seeking work.
 *
 * Browsers request audio in byte ranges; without 206 responses a track cannot
 * be scrubbed and some mobile players refuse to play it at all.
 */

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

export interface ByteRange {
  start: number
  end: number
}

/**
 * Parses a `Range` header against a known object size.
 * Returns null when there is no (usable) range, and throws 416 when the range
 * cannot be satisfied.
 */
export function resolveByteRange(
  header: string | undefined,
  size: number,
  event: H3Event,
): ByteRange | null {
  if (!header || size <= 0)
    return null

  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim())
  if (!match)
    return null

  const rawStart = match[1] ?? ''
  const rawEnd = match[2] ?? ''
  if (!rawStart && !rawEnd)
    return null

  let start: number
  let end: number

  if (!rawStart) {
    // Suffix range: the last N bytes.
    const suffix = Number(rawEnd)
    if (!Number.isFinite(suffix) || suffix <= 0)
      return null
    start = Math.max(0, size - suffix)
    end = size - 1
  }
  else {
    start = Number(rawStart)
    if (!Number.isFinite(start) || start < 0)
      return null
    const parsedEnd = rawEnd === '' ? Number.NaN : Number(rawEnd)
    end = Number.isFinite(parsedEnd) ? parsedEnd : size - 1
    end = Math.min(end, size - 1)
  }

  if (start >= size || start > end) {
    setHeader(event, 'content-range', `bytes */${size}`)
    setHeader(event, 'accept-ranges', 'bytes')
    throwApi(416, 'RANGE_NOT_SATISFIABLE', 'The requested part of that file is not available.')
  }

  return { start, end }
}

export function imageMimeFor(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_MIME_BY_EXTENSION[ext] ?? 'application/octet-stream'
}

/** Best-effort file extension for an audio mime type (used for downloads). */
export function audioExtensionFor(mime: string, fallbackKey: string): string {
  const fromKey = fallbackKey.split('.').pop()?.toLowerCase() ?? ''
  if (fromKey && /^[a-z0-9]{2,5}$/.test(fromKey))
    return fromKey

  const map: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac',
    'audio/webm': 'weba',
  }
  return map[mime] ?? 'audio'
}
