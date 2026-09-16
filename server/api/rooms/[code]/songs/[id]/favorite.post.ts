/**
 * POST /api/rooms/:code/songs/:id/favorite — toggle (or set) a favorite.
 * Body `{ favorite?: boolean }`; omitted means "toggle".
 */
export default defineEventHandler(async (event) => {
  rateLimit(event, 'song:favorite', 120, 60_000)

  const { guest, song } = await useSongContext(event)
  const body = await readBody<{ favorite?: unknown }>(event).catch(() => ({}))
  const input = parseWith(favoriteSchema, body)

  const desired = input.favorite ?? !(await isFavorite(song.id, guest!.id))
  await setFavorite(song.id, guest!.id, desired)

  return { songId: song.id, favorited: desired }
})
