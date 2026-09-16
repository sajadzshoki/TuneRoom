/**
 * POST /api/rooms/:code/songs/:id/play — count a play for "Most played".
 * De-duplicated per guest per minute, so seeking or reloading cannot inflate it.
 */
export default defineEventHandler(async (event) => {
  rateLimit(event, 'song:play', 120, 60_000)

  const { room, guest, song } = await useSongContext(event)
  await registerPlay(room.id, song.id, guest!.id)

  return { songId: song.id, counted: true }
})
