/**
 * GET /api/rooms/:code — public room card.
 *
 * Deliberately readable without membership: the join screen needs the room name
 * and the number of people listening. Songs stay behind the membership check.
 */
export default defineEventHandler(async (event) => {
  const room = await requireRoom(roomRefFromEvent(event))
  const guest = await currentGuest(event)
  return { room: await buildRoomDTO(room, guest) }
})
