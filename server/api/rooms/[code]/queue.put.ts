import type { QueueDTO } from '#shared/types'

/** PUT /api/rooms/:code/queue — replace the caller's queue. */
export default defineEventHandler(async (event): Promise<QueueDTO> => {
  rateLimit(event, 'queue:write', 120, 60_000)

  const { room, guest } = await useRoomContext(event)
  const body = await readBody<{ songIds?: unknown }>(event).catch(() => ({}))
  const input = parseWith(queueSchema, body)

  const alive = await pruneQueue(input.songIds, room.id)
  await writeQueue(room.id, guest!.id, alive)

  return { songIds: alive }
})
