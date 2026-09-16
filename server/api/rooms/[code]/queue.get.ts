import type { QueueDTO } from '#shared/types'

/** GET /api/rooms/:code/queue — the caller's persisted playback queue. */
export default defineEventHandler(async (event): Promise<QueueDTO> => {
  const { room, guest } = await useRoomContext(event)
  return { songIds: await readQueue(room.id, guest!.id) }
})
