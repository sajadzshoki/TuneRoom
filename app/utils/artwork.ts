import { avatarKeyForSeed, avatarUrl } from '#shared/avatars'

/**
 * Placeholder artwork.
 *
 * Most uploads have embedded cover art, but plenty do not. Rather than showing
 * an empty grey box, songs without artwork get a deterministic tile generated
 * from their title — the same visual language as the avatars, so the room looks
 * composed instead of half-finished.
 */
export function artworkFor(seed: string): string {
  return avatarUrl(avatarKeyForSeed(seed || 'tuneroom'), { radius: 0, size: 512, label: '' })
}

/** Same generator as a circle, for people. */
export function avatarFor(key: string | null | undefined): string {
  return avatarUrl(key, { size: 96, radius: 32 })
}
