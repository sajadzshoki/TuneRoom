/**
 * Audio/image formats accepted by the API.
 *
 * Shared between the server (which enforces them) and the upload UI (which uses
 * them for the file picker's `accept` attribute and for pre-flight checks), so
 * the two can never drift apart.
 */

/** Audio container extensions the server stores. */
export const AUDIO_EXTENSIONS = [
  'mp3',
  'm4a',
  'aac',
  'wav',
  'ogg',
  'oga',
  'opus',
  'flac',
  'weba',
] as const

/** Cover image extensions the server stores. */
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const

/** `accept` value for an audio file input. */
export const AUDIO_ACCEPT = [
  ...AUDIO_EXTENSIONS.map(extension => `.${extension}`),
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
  'audio/ogg',
  'audio/flac',
  'audio/webm',
].join(',')

/** `accept` value for a cover image input. */
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

/** True when a file name has an accepted audio extension. */
export function hasAudioExtension(fileName: string): boolean {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim())
  if (!match)
    return false
  return (AUDIO_EXTENSIONS as readonly string[]).includes(match[1]!.toLowerCase())
}
