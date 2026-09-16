import { randomInt } from 'node:crypto'

const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
/** Ambiguous characters (0/O, 1/I/L) are excluded so codes can be read aloud. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** Short, URL-safe, collision-resistant identifier for database rows. */
export function newId(size = 18): string {
  let out = ''
  for (let i = 0; i < size; i++)
    out += ID_ALPHABET[randomInt(ID_ALPHABET.length)]
  return out
}

/** Six character shareable room code, e.g. `K7P9Q2`. */
export function newRoomCode(size = 6): string {
  let out = ''
  for (let i = 0; i < size; i++)
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return out
}

/** Turns a room name into a human friendly path segment. */
export function slugify(input: string, fallback = 'room'): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')

  return slug.length >= 2 ? slug : fallback
}

/** A safe file name derived from an arbitrary user supplied name. */
export function sanitizeFileName(input: string, fallback = 'audio'): string {
  const base = input
    .normalize('NFKD')
    .replace(/[^\w.\-\s()]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80)

  return base || fallback
}
