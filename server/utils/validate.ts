import { z } from 'zod'
import { AVATAR_KEYS, isAvatarKey } from '#shared/avatars'

/**
 * Input validation.
 *
 * Every API handler parses its input through one of these schemas before doing
 * anything else, so no handler ever trusts raw request data.
 *
 * Two flavours of optional text exist on purpose:
 *  - `optionalText` for create payloads: absent or empty becomes `null`.
 *  - `patchText` for update payloads: absent stays absent (so a partial update
 *    cannot silently erase a column) and an empty string clears the value.
 */

/** Lenient JSON parse for optional multipart text fields. */
export function parseJsonSafe(value: string): unknown {
  try {
    return JSON.parse(value)
  }
  catch {
    return null
  }
}

export function parseWith<Schema extends z.ZodType>(schema: Schema, data: unknown): z.output<Schema> {
  const result = schema.safeParse(data)
  if (!result.success) {
    const fields: Record<string, string> = {}
    for (const issue of result.error.issues) {
      const key = issue.path.length > 0 ? issue.path.join('.') : 'value'
      fields[key] ??= issue.message
    }
    validationError(fields)
  }
  return result.data
}

/** Names are displayed verbatim next to songs, so control characters are stripped. */
const cleanText = (value: string) =>
  [...value]
    .map((char) => {
      const code = char.codePointAt(0) ?? 32
      return code < 32 || code === 127 ? ' ' : char
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()

function requiredText(min: number, max: number, message: string) {
  return z
    .string({ error: message })
    .trim()
    .min(min, message)
    .max(max, `Keep it under ${max} characters.`)
    .transform(cleanText)
    .pipe(z.string().min(min, message).max(max, `Keep it under ${max} characters.`))
}

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters.`)
    .optional()
    .transform(value => (value && value.length > 0 ? value : null))
}

function patchText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters.`)
    .optional()
    .transform(value => (value === undefined ? undefined : (value.length > 0 ? value : null)))
}

const name = requiredText(1, 40, 'Please enter a name.')
const roomName = requiredText(2, 60, 'Give the room a name.')
const songTitle = requiredText(1, 200, 'A title is required.')

const avatar = z
  .string({ error: 'Please pick an avatar.' })
  .refine(isAvatarKey, { message: 'Pick one of the provided avatars.' })

export const createGuestSchema = z.object({ name, avatar })

export const updateGuestSchema = z
  .object({ name: name.optional(), avatar: avatar.optional() })
  .refine(value => value.name !== undefined || value.avatar !== undefined, {
    message: 'Nothing to update.',
  })

export const createRoomSchema = z.object({
  name: roomName,
  description: optionalText(280),
})

export const updateRoomSchema = z
  .object({ name: roomName.optional(), description: patchText(280) })
  .refine(value => value.name !== undefined || value.description !== undefined, {
    message: 'Nothing to update.',
  })

export const roomCodeParamSchema = z
  .string()
  .trim()
  .min(2, 'That room reference is too short.')
  .max(80, 'That room reference is too long.')

export const songIdParamSchema = z.string().trim().min(1).max(40)

export const updateSongSchema = z
  .object({
    title: songTitle.optional(),
    artist: patchText(200),
    album: patchText(200),
  })
  .refine(
    value => value.title !== undefined || value.artist !== undefined || value.album !== undefined,
    { message: 'Nothing to update.' },
  )

/** Optional metadata overrides sent alongside an upload. Lenient by design. */
export const songOverridesSchema = z
  .object({
    title: z.string().trim().max(200).optional(),
    artist: z.string().trim().max(200).optional(),
    album: z.string().trim().max(200).optional(),
  })
  .optional()

export const addUrlSongSchema = z.object({
  url: z
    .string({ error: 'Enter a link.' })
    .trim()
    .min(8, 'Enter a full link, including https://')
    .max(2048, 'That link is too long.'),
  title: songTitle.optional(),
  artist: optionalText(200),
  album: optionalText(200),
})

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform(value => value === true || value === 'true' || value === '1')
  .optional()

export const songQuerySchema = z.object({
  q: z.string().trim().max(120).optional().transform(value => value || undefined),
  sort: z.enum(['recent', 'plays', 'title', 'artist']).optional(),
  favorites: booleanish,
})

export const favoriteSchema = z.object({
  favorite: z.boolean().optional(),
})

export const queueSchema = z.object({
  songIds: z
    .array(z.string().min(1).max(40))
    .max(500, 'Queues are limited to 500 tracks.')
    .transform(ids => [...new Set(ids)]),
})

export { AVATAR_KEYS }
