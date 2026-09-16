import type { RoomStateDTO } from '#shared/types'

/**
 * GET /api/rooms/:code/state — everything the room screen needs in one round
 * trip: room, library, people online and the caller's queue.
 */
export default defineEventHandler<Promise<RoomStateDTO>>(async (event) => {
  const { room, guest } = await useRoomContext(event)

  const [songs, members, queue, roomDto] = await Promise.all([
    listSongs(room, guest),
    listMembers(room, guest?.id),
    readQueue(room.id, guest?.id ?? null),
    buildRoomDTO(room, guest),
  ])

  return { room: roomDto, songs, members, queue }
})
