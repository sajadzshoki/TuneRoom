/** DELETE /api/rooms/:code/songs/:id — uploader or room owner only. */
export default defineEventHandler(async (event) => {
  rateLimit(event, 'song:delete', 60, 60_000)

  const { room, guest, song } = await useSongContext(event)
  if (!canManageSong(song, guest!.id, room.ownerId))
    forbidden('Only the person who added this song or the room owner can remove it.')

  await deleteSong(song)
  return { deleted: true, songId: song.id }
})
