/** POST /api/rooms/:code/members — join the room. Idempotent. */
export default defineEventHandler(async (event) => {
  rateLimit(event, 'room:join', 30, 60_000)

  const room = await requireRoom(roomRefFromEvent(event))
  const guest = await requireGuest(event)

  await joinRoom(room.id, guest.id)

  return { room: await buildRoomDTO(room, guest), joined: true }
})
